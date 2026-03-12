import asyncio
import json
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_org_context
from app.schemas.schemas import ChatRequest, OrgContext
from app.core.database import get_tenant_session, get_db
from app.services.filtering import filtering_service
import logging
import re
from app.services.proxy import stream_gpt, get_connection, check_web_search_intent, call_llm_simple, PROVIDER_DEFAULTS

logger = logging.getLogger(__name__)

# Focused prompt for the search-intent check call (not the full agent prompt)
_SEARCH_CHECK_SYSTEM = (
    "You have a web_search tool. Call it if the request involves current events, recent data, "
    "prices, statistics, competitors, trends, or anything where up-to-date information helps. "
    "When uncertain, prefer to search. Only skip searching for simple conversational questions."
)

# Regex to detect explicit search requests
_EXPLICIT_SEARCH_RE = re.compile(
    r"\b(search(\s+for)?|look\s+up|look\s+it\s+up|google|bing|browse|find(\s+(me|out))?|research)\b",
    re.IGNORECASE,
)


def _extract_search_query(message: str) -> Optional[str]:
    """Return the search query if the user explicitly asked to search, else None."""
    m = _EXPLICIT_SEARCH_RE.search(message)
    if not m:
        return None
    after = message[m.end():].strip().lstrip(":").strip()
    return after if len(after) > 3 else message


# ── Adaptive refinement ────────────────────────────────────────────────────

_COMPLEX_TASK_RE = re.compile(
    r"\b(help\s+me|please|create|write|draft|plan|research|build|design|develop|"
    r"analyz|strateg|campaign|content|article|email|website|seo|marketing|blog|"
    r"keywords?|competitor|report|presentation|business|launch|project|goal|"
    r"how\s+do|how\s+to|what\s+are|can\s+you|could\s+you|make\s+a|set\s+up|"
    r"improve|generat|outlin|summar|explain|describe|compar|recommend|suggest)\b",
    re.IGNORECASE,
)


def _needs_refinement(message: str) -> bool:
    """Return True if the message warrants the 3-call refinement loop."""
    words = message.split()
    if len(words) <= 6:
        return False  # Short messages always get instant answers
    return bool(_COMPLEX_TASK_RE.search(message))


# ── Auto-research injection ────────────────────────────────────────────────

# Detect instructions telling the user to manually use external research tools
_MANUAL_TOOL_RE = re.compile(
    r"\b(?:go\s+to|navigate\s+to|open|visit|use|log\s+in(?:\s+to)?|sign\s+in(?:\s+to)?)\s+"
    r"(?:Google\s+(?:Keyword\s+Planner|Analytics|Trends|Search\s+Console|Ads)|"
    r"SEMrush|Ahrefs|Moz|SimilarWeb|BuzzSumo|Ubersuggest|AnswerThePublic|"
    r"Keyword\s+Planner|Facebook\s+Ads\s+Manager|Google\s+Ads|SpyFu)",
    re.IGNORECASE,
)


def _auto_research_queries(draft: str, user_goal: str) -> list[str]:
    """If draft tells user to manually use a research tool, return search queries to replace those steps."""
    if not _MANUAL_TOOL_RE.search(draft):
        return []
    topic = user_goal[:80].strip()
    dl = draft.lower()
    queries: list[str] = []
    if "keyword" in dl or "keyword planner" in dl or "seo" in dl:
        queries.append(f"{topic} best keywords search volume competition 2026")
    if "semrush" in dl or "ahrefs" in dl or "spyfu" in dl or "competitor" in dl:
        queries.append(f"{topic} top competitors analysis market share 2026")
    if "trend" in dl or "buzzsumo" in dl or "popular content" in dl:
        queries.append(f"{topic} trending topics popular content ideas 2026")
    if "analytics" in dl or "traffic" in dl:
        queries.append(f"{topic} website traffic statistics industry benchmarks 2026")
    if not queries:
        queries.append(f"{topic} data research statistics analysis 2026")
    return queries[:2]  # max 2 auto-searches per response


from app.services.verticals import build_system_prompt
from app.workers.tasks import process_analytics, generate_suggestions, generate_session_title

router = APIRouter(prefix="/chat", tags=["chat"])

AGENTIC_SYSTEM_PROMPT = """

YOU ARE A WORLD-CLASS STRATEGIC AGENT. YOU THINK DEEP, WORK HARD, EXPLAIN SIMPLY.

━━━ STEP 0 — THINK BEFORE YOU RESPOND ━━━
Every request hides a bigger real goal. Before writing anything, ask yourself:

1. REAL GOAL: What are they ACTUALLY trying to achieve beyond the literal question?
   - "How do I get Instagram followers?" → They want more customers and revenue from their business.
   - "Help me with my meta tags" → They want to rank #1 on Google and get more leads.
   - "Write me an email" → They want to convert prospects into paying customers.
   Always answer the deeper goal, not just the surface request.

2. WHAT THEY DON'T KNOW TO ASK: What adjacent areas would massively amplify their result that they've never heard of?
   - Working on SEO? They probably don't know about schema markup, Core Web Vitals, Google Business Profile.
   - Writing one blog post? They need a content calendar, internal linking strategy, repurposing plan.
   - Running Facebook ads? They need a retargeting funnel, lookalike audiences, email capture.
   Proactively surface the most impactful techniques they haven't thought to ask about.

3. GROWTH TRAJECTORY: If this user succeeds at what they asked, what is the logical next level?
   Seed that next level in the response. Push them forward. Don't let them plateau.

4. AVOID NARROW LOOPS: Never give three variations of the same idea. Expand the solution space.
   - Bad: "Write another blog post / Write a longer blog post / Add more keywords" (all the same)
   - Good: Blog posts → then link building → then Google Ads → then email nurture → then reviews strategy

━━━ LANGUAGE — SIMPLE ENOUGH FOR ANYONE ━━━
Users are NOT technical. They are business owners, not developers. Use language like this:
- "SEO" → explain as: "making Google rank your website higher so more people find you for free"
- "Backlinks" → "other websites linking to yours — like word-of-mouth referrals that Google counts"
- "Meta description" → "the short text snippet Google shows under your website in search results"
- "Schema markup" → "hidden code that tells Google exactly what your business is — like a detailed business card"
- "CTR" → "the percentage of people who see your site in Google and click on it"
Always define a technical term the FIRST time you use it, in plain English, in parentheses.
Never assume they know: SEO, CMS, backlinks, schema, DA/PA, CTR, ROAS, CPC, funnel, retargeting, A/B test.

━━━ GOLDEN RULE — DO THE WORK, DON'T DESCRIBE IT ━━━
Before every sentence: "Am I telling the user to DO something, or am I DOING it for them?"
- WRONG: "Update your meta title"  |  RIGHT: Write the exact meta title, ready to paste
- WRONG: "Write a blog post about X"  |  RIGHT: Write the complete post, every word, right here
- WRONG: "Find link-building sites"  |  RIGHT: List 12 real sites with URLs and pitch copy
- WRONG: "Incorporate keywords"  |  RIGHT: Rewrite the paragraph with keywords already in it
The user's only job: copy, paste, click Save/Publish/Send.

━━━ ASKING FOR INFORMATION ━━━
DIVISION OF EXPERTISE:
- YOU are the expert in: strategy, research, tools, techniques, writing, implementation — all of it.
- THE USER is the expert in: their own business, their specific customers, their local market, their constraints.

ONLY ask about things ONLY the user can know:
✓ Their target city or region ("What area do you serve? e.g. Austin, TX")
✓ Their website URL ("What is your website? e.g. mybusiness.com")
✓ Their specific target customer ("Who is your main customer? e.g. homeowners aged 35-55")
✓ Their known competitors by name ("Any competitors you want me to focus on?")
✓ Private-system logins they must perform themselves

NEVER ask about things you should know or decide yourself:
✗ "What keywords should I target?" — research it, then tell them
✗ "What tone/style do you prefer?" — infer from context or use professional as default
✗ "Which strategy would you like?" — you're the strategist, choose and execute the best one
✗ "Shall I continue?", "What would you like to focus on?", "What are your goals?" — delays, never ask

You may assume technical/stylistic choices (tone = professional, format = responsive, etc.) and state them briefly.
NEVER assume the user's business type, industry, or target audience — if you have no context about what they do, always ask first.
Format for valid question: "Quick question: **[specific thing only they know]?** (e.g. [example answer])"

━━━ CONTINUE WITHOUT ASKING ━━━
- After delivering content, state what comes next and deliver it. Do not wait.
- Never end with an open invitation while the goal is unfinished.
- "Reply YES when done" ONLY if the next deliverable genuinely requires knowing a private-system action was completed. Otherwise continue automatically.

━━━ EXECUTION — OUTPUT TYPES ━━━
- Meta tags: every page's title (<=60 chars) + description (<=160 chars), formatted as copy-paste blocks
- Articles: full text 800+ words, H1/H2/H3 structure, keywords embedded, internal link notes
- Ad copy: every headline + description + CTA variant, all of them, numbered
- Emails: subject + full body + P.S. — complete, production-ready
- Link building: table — Site Name | URL | Why relevant | Contact/Submission URL | Outreach pitch
- Social posts: full text + hashtags, one per line
- Schema markup: complete JSON-LD code block ready to paste
- Internal links: "On [Page], paragraph N, add '[anchor text]' → [destination URL]"

━━━ AUTONOMOUS RESEARCH — NO EXCEPTIONS ━━━
Never send user to any tool (Keyword Planner, SEMrush, Ahrefs, SimilarWeb, BuzzSumo, Analytics, etc.).
Do all research yourself. Show results in formatted tables with plain-English column headers.

━━━ BUILDING WEBSITES — FULL A-TO-Z ━━━
When the user asks you to build, create, or make a website or landing page:
1. Generate a COMPLETE, production-ready website as a single HTML file with all CSS and JavaScript embedded inline.
2. The design must be modern, visually impressive, mobile-responsive, and professional. Use gradients, clean typography, sections, hover effects.
3. Wrap the ENTIRE HTML in a special deploy tag: <site-deploy title="Site Title"><!DOCTYPE html>...full html...</site-deploy>
4. The system will automatically deploy it and give the user a live link — do NOT tell them to do anything. Do NOT say "you need to host this". Just build it and wrap it.
5. Never produce partial HTML. Never say "add your content here". Fill in realistic, compelling content based on what the user tells you about their business.

PLAN TAG FORMAT (show what you DELIVER, not what user does):
<plan>{"title":"Title","steps":["Deliver: X (plain English)","Deliver: Y","User action: paste + publish"],"current":0}</plan>"""


FORMATTING_SYSTEM_PROMPT = """

FORMATTING: Every response MUST be formatted like a well-structured web page using rich markdown:
- Use ## for main section headers and ### for subsections — every response with 2+ topics gets headers
- Use **bold** for key terms, important actions, names, and conclusions
- Use bullet lists (- ) for any group of 3+ items, options, or features
- Use numbered lists (1. 2. 3.) for sequential steps or ranked items
- Use > blockquote for tips, warnings, key insights, or callouts
- Use `code` for technical terms, commands, URLs, or file names
- Use --- horizontal rules to separate major sections in longer responses
- Use tables for comparisons, pricing, or structured data
- NEVER write more than 2 consecutive sentences of plain prose — break into bullets or use a header
- Short conversational replies (under 3 sentences) are exempt from headers but still use **bold** for key terms"""

CARD_SYSTEM_PROMPT = """

SMART CARDS & TASKS: You MUST proactively create cards for EVERYTHING actionable or worth tracking. This is not optional.

Trigger conditions — create cards whenever:
- User mentions ANY goal, plan, project, or thing they want to accomplish
- User asks for a strategy, plan, or advice (create tasks for each recommended action)
- User mentions people, companies, customers, or contacts
- User mentions an event, meeting, deadline, or date
- Any action item naturally arises from the conversation

Rules:
- For any project or multi-step goal: create the parent card PLUS 2-4 subtask cards
- For lists ("do X, Y, and Z"): one card per item, never merged
- Never say "I can create a card" — just create it silently at the end

Append at the VERY END of your response:
<card>{"type":"task","title":"Title here","fields":{"priority":"high","due":"2026-03-15","status":"todo"}}</card>

Available types: task (priority, due, assignee, status), customer (name, email, company), contact (name, email, role), event (date, time, location), reminder (when, description), project (description, deadline, status), note (tags, summary)

NEXT ACTIONS: After every response append ONE <suggestions> block with exactly 3 SPECIFIC DELIVERABLES the agent will produce next — not questions, not vague options, not user decisions.
Rules: phrased as commands the agent executes ("Write 3 SEO articles", "Create Google Ads copy", "Build 15 outreach emails"). First suggestion = natural next step toward completing the goal. Never suggest "Continue", "Let me know", "Tell me more", "Shall I", "What would you like". 8 words max each.
<suggestions>["Specific deliverable 1","Specific deliverable 2","Specific deliverable 3"]</suggestions>

RETITLE: Append <retitle>New Title</retitle> only when the conversation topic genuinely changes (title case, 5 words max).

Order: <card> blocks → <suggestions> → <retitle>"""


COMPLETENESS_EVAL_PROMPT = """\
You are a brutally strict deliverable reviewer. Your only job: did the AI actually DO the work, or did it describe work for the user to do?

Answer INCOMPLETE if ANY of these are true:
1. Tells user to "write X", "create X", "add X", "update X", "incorporate X", "include X", "insert X" WITHOUT the actual finished X in the draft.
2. Says "here is an example" when the user needs the final production-ready version (not an example).
3. Has a step like "Update your meta tags" without ALL actual meta titles + descriptions written for every page.
4. Mentions writing an article/post/email without the complete text in the response.
5. Tells user to "find websites for link building" without listing specific real sites with URLs.
6. Tells user to "research keywords" or "use any tool" instead of providing the actual keyword table.
7. Any step requires the user to make a creative or research decision the AI should have made.
8. Has placeholder text like "[your keyword]", "[business name]", "[insert here]", "etc.", or "[example]".
9. Any step says "review your content and..." — reviewing is the AI's job.
10. The user would need to write, research, or create ANYTHING after reading the response.
11. Ends with "let me know what you'd like to do next", "shall I continue?", "what would you like to focus on?", "is there anything else?", or any variant — while the overall goal is not fully achieved.
12. Uses "Reply YES when done" for a step that does NOT require user action in their private system (agent is just pausing unnecessarily).
13. Asks the user multiple questions at once, or asks vague questions ("What are your goals?", "What do you prefer?") when a single specific question or a reasonable assumption would suffice.
14. Suggestions at the end are vague options ("Continue", "Tell me more") instead of specific concrete next deliverables.
15. Asks the user a technical or strategic question the agent should answer itself ("What keywords would you like to target?", "Which approach do you prefer?", "What tone should I use?") — the agent is the expert, it decides.
16. Solution addresses only one narrow area when adjacent high-impact techniques would significantly amplify results (e.g., writes blog posts but doesn't mention link building, Google Business Profile, or internal linking for an SEO request).

Answer COMPLETE only if:
- Every deliverable is fully produced and ready to copy-paste
- User's only actions: open tool, paste, click save/publish/send
- Zero placeholders, zero "examples", zero "you should write..."
- Ends with at most ONE specific targeted question (if truly needed) or states what comes next
- Suggestions are specific next deliverables, not open-ended choices

GOAL: {goal}

AI DRAFT:
{draft}

Answer with one word only — COMPLETE or INCOMPLETE:"""

REFINEMENT_PROMPT = """\
Rewrite the draft below applying ALL rules without exception:

CONTENT RULES (do the work, never describe it):
1. Every "write X", "create X", "add X", "update X", "incorporate X" — write X in full right there. Deliver it, never refer to it.
2. Meta tags: COMPLETE title (<=60 chars) + description (<=160 chars) for EVERY page. Production versions, not examples.
3. Articles: complete text 800+ words minimum. H1/H2 structure, keywords embedded, no outlines, full text.
4. Link building: table of 10-15 REAL sites — Site | URL | Relevance | Contact/Submission URL | Exact outreach pitch paragraph.
5. Keywords: table — Keyword | Est. Monthly Searches | Competition | Intent | Where to place it.
6. Ad copy: every headline + description + CTA — all variants, numbered.
7. Social posts: each post in full with hashtags.
8. Internal links: "On [Page], paragraph N, add '[anchor text]' linking to [URL]" for every link.
9. Schema markup: complete JSON-LD code block ready to paste.
10. Replace every "[your keyword]", "[business name]", "etc.", "[example]" with real specific values.
11. Replace every "go to [any tool]" with actual data from AUTO-RESEARCHED DATA section below.

INTERACTION RULES (no stalling, no vague endings):
12. Remove all "let me know what you'd like to do next", "shall I continue?", "what would you like to focus on?", "is there anything else?" — instead state the next deliverable or continue directly.
13. Remove "Reply YES when done" unless the NEXT step truly cannot begin without knowing the user completed a private-system action. If it can proceed regardless, remove it.
14. If one specific piece of info is needed, ask for that ONE thing with an example: "What is your target city? (e.g. Austin, TX)". If it can be assumed, state the assumption.
15. Suggestions must be specific next deliverables the agent will produce ("Write 3 SEO articles", "Create Google Ads copy"), not questions or open-ended options.
16. Replace any question asking the user for a technical or strategic decision with: make the decision yourself as the expert, state the assumption briefly ("I'll use a professional tone — adjust if needed"), and proceed. Only keep questions about information only the user could know (their city, their URL, their specific customers).
17. Expand narrow solutions: if the response addresses only one technique, add 2-3 adjacent high-impact techniques that amplify results. SEO blog post → add internal linking strategy + Google Business Profile optimization + link-building targets. Email campaign → add subject line A/B variants + follow-up sequence + list segmentation advice.
18. Define every technical term in plain English on first use in parentheses: "SEO (making Google rank your website higher so more people find you for free)", "backlinks (other websites linking to yours — like online referrals that Google counts)", "schema markup (hidden code that tells Google exactly what your business is)". Use plain business language throughout.

ORIGINAL DRAFT:
{draft}
{research_section}
REWRITTEN RESPONSE (user's only job: paste and click):"""


def s(schema: str, table: str) -> str:
    """Return schema-qualified table name."""
    return f'"{schema}".{table}'


@router.get("/sessions")
async def list_sessions(
    archived: bool = False,
    agent_id: Optional[str] = None,
    ctx: OrgContext = Depends(get_org_context),
):
    session = await get_tenant_session(ctx.schema_name)
    try:
        if agent_id == "general":
            # Sessions with no agent (general tab)
            result = await session.execute(
                text(f"SELECT * FROM {s(ctx.schema_name, 'sessions')} WHERE user_id = :uid AND is_archived = :archived AND agent_id IS NULL ORDER BY updated_at DESC"),
                {"uid": str(ctx.user_id), "archived": archived},
            )
        elif agent_id:
            result = await session.execute(
                text(f"SELECT * FROM {s(ctx.schema_name, 'sessions')} WHERE user_id = :uid AND is_archived = :archived AND agent_id = CAST(:aid AS UUID) ORDER BY updated_at DESC"),
                {"uid": str(ctx.user_id), "archived": archived, "aid": agent_id},
            )
        else:
            result = await session.execute(
                text(f"SELECT * FROM {s(ctx.schema_name, 'sessions')} WHERE user_id = :uid AND is_archived = :archived ORDER BY updated_at DESC"),
                {"uid": str(ctx.user_id), "archived": archived},
            )
        rows = []
        for r in result:
            d = dict(r._mapping)
            for k in ("id", "user_id"):
                if d.get(k):
                    d[k] = str(d[k])
            for k in ("created_at", "updated_at"):
                if d.get(k):
                    d[k] = d[k].isoformat()
            rows.append(d)
        return rows
    finally:
        await session.close()


@router.get("/sessions/{session_id}/messages")
async def get_messages(session_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"SELECT id FROM {s(ctx.schema_name, 'sessions')} WHERE id = :sid AND user_id = :uid"),
            {"sid": str(session_id), "uid": str(ctx.user_id)},
        )
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")

        result = await session.execute(
            text(f"SELECT * FROM {s(ctx.schema_name, 'messages')} WHERE session_id = :sid ORDER BY created_at"),
            {"sid": str(session_id)},
        )
        return [dict(r._mapping) for r in result]
    finally:
        await session.close()


async def _load_agent_context(ctx: OrgContext, tenant) -> Optional[dict]:
    """Return the active agent + user goals, or None."""
    result = await tenant.execute(
        text(f"""
            SELECT a.id, a.name, a.system_prompt, a.provider, a.model
            FROM "{ctx.schema_name}".user_agent_assignments uaa
            JOIN "{ctx.schema_name}".agents a ON a.id = uaa.agent_id
            WHERE uaa.user_id = CAST(:uid AS UUID) AND uaa.is_active = TRUE AND a.is_active = TRUE
        """),
        {"uid": str(ctx.user_id)},
    )
    row = result.fetchone()
    if not row:
        return None
    d = dict(row._mapping)
    # Also load user's personal goals/context for this agent
    goals_result = await tenant.execute(
        text(f"""
            SELECT goals, context_note, style_preference
            FROM "{ctx.schema_name}".user_agent_goals
            WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)
        """),
        {"uid": str(ctx.user_id), "aid": str(d["id"])},
    )
    goals_row = goals_result.fetchone()
    if goals_row:
        d["user_goals"] = list(goals_row.goals) if goals_row.goals else []
        d["user_context"] = goals_row.context_note or ""
        d["user_style"] = goals_row.style_preference or "balanced"
    else:
        d["user_goals"] = []
        d["user_context"] = ""
        d["user_style"] = "balanced"
    return d


async def _load_org_context(ctx: OrgContext, db: AsyncSession, tenant) -> tuple[str, str]:
    """Returns (vertical, doc_context_str) for use in system prompts."""
    org_row = await db.execute(
        text("SELECT vertical FROM public.organizations WHERE org_key = :id"),
        {"id": ctx.org_key},
    )
    row = org_row.fetchone()
    vertical = (row.vertical if row else None) or "general"

    docs_row = await tenant.execute(
        text(f'SELECT filename, content_text FROM "{ctx.schema_name}".org_documents ORDER BY created_at LIMIT 5')
    )
    docs = [dict(r._mapping) for r in docs_row]
    return vertical, docs


@router.get("/agent-starters")
async def get_agent_starters(ctx: OrgContext = Depends(get_org_context)):
    """Generate 4 conversation-starter suggestions for the user's assigned agent."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        agent = await _load_agent_context(ctx, session)
        if not agent:
            return []
        prompt = (
            f"You are this AI assistant:\n{agent['system_prompt'][:600]}\n\n"
            "Generate exactly 4 short conversation starters (under 8 words each) that a new user "
            "would realistically send to begin working with you. "
            'Return ONLY a JSON array, e.g. ["Starter 1","Starter 2","Starter 3","Starter 4"]'
        )
        from app.services.proxy import call_gpt
        raw = await call_gpt(agent["provider"], [{"role": "user", "content": prompt}], session, ctx.schema_name, system_prompt="")
        starters = json.loads(raw.strip())
        if isinstance(starters, list):
            return [str(s) for s in starters[:4]]
        return []
    except Exception:
        return [
            "What can you help me with?",
            "Walk me through what you do",
            "Let's get started",
            "Show me an example",
        ]
    finally:
        await session.close()


@router.get("/agent-context")
async def get_agent_context(ctx: OrgContext = Depends(get_org_context)):
    """Return the active agent assigned to the calling user (or null)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        agent = await _load_agent_context(ctx, session)
        return agent
    finally:
        await session.close()


@router.get("/agents")
async def get_user_agents(ctx: OrgContext = Depends(get_org_context)):
    """Return all agents assigned to the calling user."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                SELECT a.id, a.name, a.description, a.system_prompt, a.provider, a.model,
                       a.is_active, a.created_at, a.updated_at, uaa.is_active AS is_selected
                FROM "{ctx.schema_name}".user_agent_assignments uaa
                JOIN "{ctx.schema_name}".agents a ON a.id = uaa.agent_id
                WHERE uaa.user_id = CAST(:uid AS UUID) AND a.is_active = TRUE
                ORDER BY uaa.assigned_at
            """),
            {"uid": str(ctx.user_id)},
        )
        rows = []
        for r in result:
            d = dict(r._mapping)
            for k in ("id",):
                if d.get(k):
                    d[k] = str(d[k])
            for k in ("created_at", "updated_at"):
                if d.get(k):
                    d[k] = d[k].isoformat()
            # Rename is_selected → is_active for the UserAgent type (is_active on the assignment)
            d["is_active"] = d.pop("is_selected", False)
            rows.append(d)
        return rows
    finally:
        await session.close()


@router.post("/agent-active")
async def set_active_agent(body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Set the active agent for the calling user."""
    agent_id = body.get("agent_id", "")
    if not agent_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="agent_id is required")
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".user_agent_assignments SET is_active = FALSE WHERE user_id = CAST(:uid AS UUID)'),
            {"uid": str(ctx.user_id)},
        )
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".user_agent_assignments SET is_active = TRUE WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)'),
            {"uid": str(ctx.user_id), "aid": agent_id},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.get("/agent-goals/{agent_id}")
async def get_agent_goals(agent_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Return the user's goals for a specific agent."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                SELECT goals, context_note, style_preference, session_count,
                       onboarding_completed_at, last_checkin_at
                FROM "{ctx.schema_name}".user_agent_goals
                WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)
            """),
            {"uid": str(ctx.user_id), "aid": str(agent_id)},
        )
        row = result.fetchone()
        if not row:
            return None
        d = dict(row._mapping)
        for k in ("onboarding_completed_at", "last_checkin_at"):
            if d.get(k):
                d[k] = d[k].isoformat()
        return d
    finally:
        await session.close()


@router.post("/agent-goals/{agent_id}")
async def save_agent_goals(agent_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Upsert goals for user+agent. Sets onboarding timestamp on first save."""
    goals = body.get("goals", [])
    context_note = body.get("context_note", "")
    style_preference = body.get("style_preference", "balanced")
    onboarding_completed_at = body.get("onboarding_completed_at")
    last_checkin_at = body.get("last_checkin_at")

    session = await get_tenant_session(ctx.schema_name)
    try:
        # Check if record exists
        existing = await session.execute(
            text(f'SELECT id, onboarding_completed_at FROM "{ctx.schema_name}".user_agent_goals WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)'),
            {"uid": str(ctx.user_id), "aid": str(agent_id)},
        )
        row = existing.fetchone()

        if row is None:
            # First time: INSERT
            await session.execute(
                text(f"""
                    INSERT INTO "{ctx.schema_name}".user_agent_goals
                        (user_id, agent_id, goals, context_note, style_preference,
                         onboarding_completed_at, last_checkin_at, updated_at)
                    VALUES (CAST(:uid AS UUID), CAST(:aid AS UUID),
                            CAST(:goals AS JSONB), :context_note, :style_preference,
                            :onboarding_completed_at, :last_checkin_at, NOW())
                """),
                {
                    "uid": str(ctx.user_id), "aid": str(agent_id),
                    "goals": json.dumps(goals), "context_note": context_note,
                    "style_preference": style_preference,
                    "onboarding_completed_at": onboarding_completed_at,
                    "last_checkin_at": last_checkin_at,
                },
            )
        else:
            # UPDATE: increment session_count if already onboarded
            await session.execute(
                text(f"""
                    UPDATE "{ctx.schema_name}".user_agent_goals SET
                        goals = CAST(:goals AS JSONB),
                        context_note = :context_note,
                        style_preference = :style_preference,
                        onboarding_completed_at = COALESCE(onboarding_completed_at, :onboarding_completed_at),
                        last_checkin_at = COALESCE(:last_checkin_at, last_checkin_at),
                        updated_at = NOW()
                    WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)
                """),
                {
                    "uid": str(ctx.user_id), "aid": str(agent_id),
                    "goals": json.dumps(goals), "context_note": context_note,
                    "style_preference": style_preference,
                    "onboarding_completed_at": onboarding_completed_at,
                    "last_checkin_at": last_checkin_at,
                },
            )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.get("/agent-quick-prompts/{agent_id}")
async def get_agent_quick_prompts(agent_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """AI-generate 6 quick prompt suggestions based on agent + user goals."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        agent_row = await session.execute(
            text(f'SELECT name, system_prompt, provider FROM "{ctx.schema_name}".agents WHERE id = CAST(:id AS UUID) AND is_active = TRUE'),
            {"id": str(agent_id)},
        )
        agent = agent_row.fetchone()
        if not agent:
            return []

        goals_row = await session.execute(
            text(f'SELECT goals FROM "{ctx.schema_name}".user_agent_goals WHERE user_id = CAST(:uid AS UUID) AND agent_id = CAST(:aid AS UUID)'),
            {"uid": str(ctx.user_id), "aid": str(agent_id)},
        )
        goals_data = goals_row.fetchone()
        goals = list(goals_data.goals) if goals_data and goals_data.goals else []
        goals_str = ", ".join(goals[:4]) if goals else "general productivity"

        prompt = (
            f"You are this AI assistant:\n{agent.system_prompt[:400]}\n\n"
            f"User goals: {goals_str}\n\n"
            "Generate exactly 6 short quick-prompt suggestions (under 10 words each) that this user "
            "would want to click to immediately get value. Be specific to the agent and user goals. "
            'Return ONLY a JSON array: ["Prompt 1","Prompt 2","Prompt 3","Prompt 4","Prompt 5","Prompt 6"]'
        )
        from app.services.proxy import call_gpt
        raw = await call_gpt(agent.provider, [{"role": "user", "content": prompt}], session, ctx.schema_name, system_prompt="")
        prompts = json.loads(raw.strip())
        if isinstance(prompts, list):
            return [str(p) for p in prompts[:6]]
        return []
    except Exception:
        return [
            "Help me plan my day",
            "Draft a quick summary",
            "What should I focus on?",
            "Review my priorities",
            "Help me write something",
            "Give me quick advice",
        ]
    finally:
        await session.close()


@router.post("/")
async def chat(req: ChatRequest, ctx: OrgContext = Depends(get_org_context), db: AsyncSession = Depends(get_db)):
    schema = ctx.schema_name
    session = await get_tenant_session(schema)
    try:
        # Create or get session
        if req.session_id:
            result = await session.execute(
                text(f"SELECT id FROM {s(schema, 'sessions')} WHERE id = :sid AND user_id = :uid"),
                {"sid": str(req.session_id), "uid": str(ctx.user_id)},
            )
            if not result.fetchone():
                raise HTTPException(status_code=404, detail="Session not found")
            session_id = req.session_id
        else:
            # Look up active agent to associate with the new session
            _active_agent = await _load_agent_context(ctx, session)
            _agent_id_for_session = str(_active_agent["id"]) if _active_agent else None
            if _agent_id_for_session:
                result = await session.execute(
                    text(f"INSERT INTO {s(schema, 'sessions')} (user_id, gpt_target, agent_id) VALUES (:uid, :gpt, CAST(:aid AS UUID)) RETURNING id"),
                    {"uid": str(ctx.user_id), "gpt": req.gpt_target, "aid": _agent_id_for_session},
                )
            else:
                result = await session.execute(
                    text(f"INSERT INTO {s(schema, 'sessions')} (user_id, gpt_target) VALUES (:uid, :gpt) RETURNING id"),
                    {"uid": str(ctx.user_id), "gpt": req.gpt_target},
                )
            session_id = result.fetchone().id
            await session.commit()

        # Incognito mode: bypass filtering, skip saving to DB, go direct to provider
        if req.incognito:
            # Use current session history but don't save new messages
            history = await session.execute(
                text(f"SELECT role, content FROM {s(schema, 'messages')} WHERE session_id = :sid AND was_blocked = FALSE ORDER BY created_at"),
                {"sid": str(session_id)},
            )
            inc_messages = [{"role": r.role, "content": r.content} for r in history]
            inc_messages.append({"role": "user", "content": req.message})

            async def incognito_stream():
                try:
                    async for chunk in stream_gpt(req.gpt_target, inc_messages, session, schema, system_prompt=""):
                        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                    return
                yield f"data: {json.dumps({'done': True, 'session_id': str(session_id)})}\n\n"

            return StreamingResponse(incognito_stream(), media_type="text/event-stream")

        # Run filtering (uses schema-qualified queries)
        filter_result = await filtering_service.evaluate(req.message, session, schema)

        if filter_result.action == "block":
            await session.execute(
                text(f"""
                    INSERT INTO {s(schema, 'messages')} (session_id, role, content, was_blocked, block_reason, gpt_target)
                    VALUES (:sid, 'user', :content, TRUE, :reason, :gpt)
                """),
                {"sid": str(session_id), "content": req.message, "reason": filter_result.reason, "gpt": req.gpt_target},
            )
            await session.commit()
            process_analytics.delay(schema, "message_blocked", str(ctx.user_id), str(session_id), {"reason": filter_result.reason})

            async def blocked_stream():
                yield f"data: {json.dumps({'blocked': True, 'reason': filter_result.reason})}\n\n"

            return StreamingResponse(blocked_stream(), media_type="text/event-stream")

        content_to_send = filter_result.modified_content if filter_result.action == "modify" else req.message

        # Save user message
        await session.execute(
            text(f"INSERT INTO {s(schema, 'messages')} (session_id, role, content, gpt_target) VALUES (:sid, 'user', :content, :gpt)"),
            {"sid": str(session_id), "content": req.message, "gpt": req.gpt_target},
        )

        # Load conversation history
        history = await session.execute(
            text(f"SELECT role, content FROM {s(schema, 'messages')} WHERE session_id = :sid AND was_blocked = FALSE ORDER BY created_at"),
            {"sid": str(session_id)},
        )
        messages = [{"role": r.role, "content": r.content} for r in history]
        messages[-1]["content"] = content_to_send

        # Load vertical + docs for system context
        vertical, docs = await _load_org_context(ctx, db, session)
        system_prompt = build_system_prompt(vertical, docs)

        # Prepend agent system prompt + agentic instructions + user goals if assigned
        agent = await _load_agent_context(ctx, session)
        if agent:
            agent_prompt = agent["system_prompt"] + AGENTIC_SYSTEM_PROMPT
            if agent.get("user_goals"):
                goals_list = "\n".join(f"- {g}" for g in agent["user_goals"])
                agent_prompt += f"\n\nUSER'S STATED GOALS:\n{goals_list}"
            if agent.get("user_context"):
                agent_prompt += f"\n\nUSER CONTEXT: {agent['user_context']}"
            if agent.get("user_style") and agent["user_style"] != "balanced":
                style_map = {
                    "brief": "Give concise, direct answers — essentials only.",
                    "detailed": "Give thorough answers with context, examples, and step-by-step detail.",
                }
                agent_prompt += f"\n\nRESPONSE STYLE: {style_map.get(agent['user_style'], '')}"
            system_prompt = agent_prompt + "\n\n" + system_prompt

        # If discussing a card, inject card context + update instructions
        if req.card_id:
            card_row = await session.execute(
                text(f'SELECT * FROM "{schema}".cards WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
                {"id": req.card_id, "uid": str(ctx.user_id)},
            )
            card_data = card_row.fetchone()
            if card_data:
                cd = dict(card_data._mapping)
                card_ctx = (
                    f'You are helping manage a {cd["type"]} card titled "{cd["title"]}".\n'
                    f'Current fields: {json.dumps(cd.get("fields") or {})}\n'
                    f'Notes: {cd.get("notes") or "(none)"}\n\n'
                    'When the user asks you to update fields, title, or notes, emit at the END of your response:\n'
                    '<card-update>{"title":"new title","fields":{"key":"value"},"notes":"updated notes"}</card-update>\n'
                    'Only include keys you are actually changing. '
                    'When creating a subtask, emit a normal <card> block — it will be linked as a subtask of this card.\n\n'
                )
                system_prompt = card_ctx + system_prompt

        # Always append formatting + smart-card instructions
        system_prompt += FORMATTING_SYSTEM_PROMPT + CARD_SYSTEM_PROMPT

        # Pre-load API connection so we can run the web-search intent check inside the generator
        _ws_api_key: Optional[str] = None
        _ws_model: Optional[str] = None
        try:
            _conn = await get_connection(req.gpt_target, session, schema)
            _ws_api_key = _conn["api_key"]
            _ws_model = _conn.get("model") or PROVIDER_DEFAULTS.get(req.gpt_target, "")
        except Exception:
            pass  # No connection configured — skip search check

        await session.commit()

        async def response_stream():
            from app.services.agent_runner import _web_search
            current_messages = list(messages)

            # ── Web search phase ───────────────────────────────────────────
            if _ws_api_key and _ws_model:
                try:
                    user_text = current_messages[-1]["content"] if current_messages else ""

                    # 1. Explicit keyword match — always search, no LLM round-trip needed
                    query = _extract_search_query(user_text)

                    # 2. No explicit keyword — ask LLM with a focused prompt (last 4 msgs max)
                    if not query:
                        recent = current_messages[-4:]
                        check_msgs = [{"role": "system", "content": _SEARCH_CHECK_SYSTEM}] + recent
                        query = await check_web_search_intent(req.gpt_target, check_msgs, _ws_api_key, _ws_model)

                    if query:
                        logger.info("Web search triggered for query: %s", query)
                        yield f"data: {json.dumps({'searching': True, 'query': query})}\n\n"
                        results = await _web_search(query, num_results=5)
                        last = current_messages[-1]
                        current_messages[-1] = {
                            "role": "user",
                            "content": (
                                f"[Web search results for: {query}]\n{results}\n\n"
                                f"---\nUser's question: {last['content']}"
                            ),
                        }
                except Exception as e:
                    logger.warning("Web search check failed: %s", e)

            # ── Self-refinement loop (OpenAI + Anthropic only) ────────────
            if _ws_api_key and _ws_model and req.gpt_target in ("openai", "anthropic"):
                try:
                    user_goal = current_messages[-1]["content"] if current_messages else ""

                    # Fast path: short/simple messages skip the refinement loop entirely
                    if not _needs_refinement(user_goal):
                        raise ValueError("simple_message")  # triggers fallback to streaming

                    # Step 1: Generate full draft
                    yield f"data: {json.dumps({'thinking': True, 'message': 'Planning response...'})}\n\n"
                    draft = await call_llm_simple(
                        req.gpt_target, current_messages, _ws_api_key, _ws_model,
                        max_tokens=4096, system_prompt=system_prompt,
                    )

                    # Step 2: Auto-research — replace "go to Google Keyword Planner" type steps
                    research_context = ""
                    research_queries = _auto_research_queries(draft, user_goal)
                    if research_queries:
                        yield f"data: {json.dumps({'thinking': True, 'message': 'Researching automatically...'})}\n\n"
                        for q in research_queries:
                            try:
                                results = await _web_search(q, num_results=5)
                                research_context += f"\n\n[Auto-searched: {q}]\n{results}"
                                logger.info("Auto-research query: %s", q)
                            except Exception as e:
                                logger.warning("Auto-research failed for %s: %s", q, e)

                    # Step 3: Evaluate completeness (cheap — max 10 tokens)
                    yield f"data: {json.dumps({'thinking': True, 'message': 'Checking completeness...'})}\n\n"
                    eval_msg = COMPLETENESS_EVAL_PROMPT.format(
                        goal=user_goal[:600], draft=draft[:3000]
                    )
                    verdict = await call_llm_simple(
                        req.gpt_target, [{"role": "user", "content": eval_msg}],
                        _ws_api_key, _ws_model, max_tokens=10, system_prompt="",
                    )

                    # Step 4: Refine if incomplete OR if we have auto-research data to inject
                    final_text = draft
                    if "INCOMPLETE" in verdict.upper() or research_context:
                        thinking_msg = "Expanding with missing steps..." if "INCOMPLETE" in verdict.upper() else "Injecting researched data..."
                        yield f"data: {json.dumps({'thinking': True, 'message': thinking_msg})}\n\n"
                        research_section = (
                            f"\n\nAUTO-RESEARCHED DATA (use this to replace any manual research instructions):{research_context}\n"
                            if research_context else ""
                        )
                        refine_msg = REFINEMENT_PROMPT.format(draft=draft, research_section=research_section)
                        final_text = await call_llm_simple(
                            req.gpt_target, [{"role": "user", "content": refine_msg}],
                            _ws_api_key, _ws_model, max_tokens=4096, system_prompt=system_prompt,
                        )

                    # Step 4: Fake-stream the final text in chunks
                    CHUNK_SIZE = 80
                    for i in range(0, len(final_text), CHUNK_SIZE):
                        yield f"data: {json.dumps({'chunk': final_text[i:i + CHUNK_SIZE]})}\n\n"
                        await asyncio.sleep(0)  # yield to event loop so chunks flush individually

                    # Save to DB
                    save_session = await get_tenant_session(schema)
                    try:
                        await save_session.execute(
                            text(f"INSERT INTO {s(schema, 'messages')} (session_id, role, content, gpt_target) VALUES (:sid, 'assistant', :content, :gpt)"),
                            {"sid": str(session_id), "content": final_text, "gpt": req.gpt_target},
                        )
                        await save_session.execute(
                            text(f"UPDATE {s(schema, 'sessions')} SET updated_at = NOW() WHERE id = :sid"),
                            {"sid": str(session_id)},
                        )
                        await save_session.commit()
                    finally:
                        await save_session.close()

                    process_analytics.delay(schema, "message_sent", str(ctx.user_id), str(session_id), {"provider": req.gpt_target})
                    doc_context = "\n".join(d["content_text"][:500] for d in docs[:2])
                    generate_suggestions.delay(schema, str(session_id), str(ctx.user_id), vertical, doc_context)
                    generate_session_title.delay(schema, str(session_id))

                    yield f"data: {json.dumps({'done': True, 'session_id': str(session_id)})}\n\n"
                    return  # Done — don't fall through to streaming

                except ValueError as e:
                    if "simple_message" not in str(e):
                        logger.warning("Self-refinement value error, falling back: %s", e)
                except Exception as e:
                    logger.warning("Self-refinement loop failed, falling back to streaming: %s", e)

            # ── Fallback: real streaming (Gemini/Ollama or refinement error) ─
            full_response = []
            try:
                async for chunk in stream_gpt(req.gpt_target, current_messages, session, schema, system_prompt=system_prompt):
                    full_response.append(chunk)
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

            complete = "".join(full_response)
            save_session = await get_tenant_session(schema)
            try:
                await save_session.execute(
                    text(f"INSERT INTO {s(schema, 'messages')} (session_id, role, content, gpt_target) VALUES (:sid, 'assistant', :content, :gpt)"),
                    {"sid": str(session_id), "content": complete, "gpt": req.gpt_target},
                )
                await save_session.execute(
                    text(f"UPDATE {s(schema, 'sessions')} SET updated_at = NOW() WHERE id = :sid"),
                    {"sid": str(session_id)},
                )
                await save_session.commit()
            finally:
                await save_session.close()

            process_analytics.delay(schema, "message_sent", str(ctx.user_id), str(session_id), {"provider": req.gpt_target})
            doc_context = "\n".join(d["content_text"][:500] for d in docs[:2])
            generate_suggestions.delay(schema, str(session_id), str(ctx.user_id), vertical, doc_context)
            generate_session_title.delay(schema, str(session_id))

            yield f"data: {json.dumps({'done': True, 'session_id': str(session_id)})}\n\n"

        return StreamingResponse(response_stream(), media_type="text/event-stream")
    finally:
        await session.close()


@router.patch("/sessions/{session_id}")
async def rename_session(session_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Rename a chat session title."""
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE {s(ctx.schema_name, 'sessions')} SET title = :title WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"title": title, "sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True, "title": title}
    finally:
        await session.close()


@router.patch("/sessions/{session_id}/archive")
async def archive_session(session_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Archive or unarchive a session."""
    archived = bool(body.get("archived", True))
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"UPDATE {s(ctx.schema_name, 'sessions')} SET is_archived = :archived WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"archived": archived, "sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}
    finally:
        await session.close()


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Permanently delete a session and all its messages."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"DELETE FROM {s(ctx.schema_name, 'sessions')} WHERE id = CAST(:sid AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id"),
            {"sid": str(session_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Session not found")
        return {"ok": True}
    finally:
        await session.close()


# ── Notes ──────────────────────────────────────────────────────────────────

@router.get("/notes")
async def get_notes(ctx: OrgContext = Depends(get_org_context)):
    """Get the user's notes (single note record, create if not exists)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT id, content, updated_at FROM "{ctx.schema_name}".notes WHERE user_id = CAST(:uid AS UUID) ORDER BY created_at LIMIT 1'),
            {"uid": str(ctx.user_id)},
        )
        row = result.fetchone()
        if row:
            return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
        # Auto-create empty note
        result = await session.execute(
            text(f"INSERT INTO \"{ctx.schema_name}\".notes (user_id, content) VALUES (CAST(:uid AS UUID), '') RETURNING id, content, updated_at"),
            {"uid": str(ctx.user_id)},
        )
        await session.commit()
        row = result.fetchone()
        return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    finally:
        await session.close()


@router.patch("/notes/{note_id}")
async def update_note(note_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Update note content."""
    content = body.get("content", "")
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'UPDATE "{ctx.schema_name}".notes SET content = :content, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING id, content, updated_at'),
            {"content": content, "id": str(note_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"id": str(row.id), "content": row.content, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
    finally:
        await session.close()


# ── Cards ───────────────────────────────────────────────────────────────────

def _card_row_to_dict(r) -> dict:
    d = dict(r._mapping)
    for k in ("id", "user_id", "parent_id", "origin_session_id", "chat_session_id"):
        if d.get(k):
            d[k] = str(d[k])
    for k in ("created_at", "updated_at"):
        if d.get(k):
            d[k] = d[k].isoformat()
    return d


@router.get("/cards")
async def list_cards(ctx: OrgContext = Depends(get_org_context)):
    """List all non-deleted cards for the user (includes subtask structure)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f'SELECT * FROM "{ctx.schema_name}".cards WHERE user_id = CAST(:uid AS UUID) AND is_deleted = FALSE ORDER BY created_at DESC'),
            {"uid": str(ctx.user_id)},
        )
        cards = [_card_row_to_dict(r) for r in result]
        return cards
    finally:
        await session.close()


@router.post("/cards")
async def create_card(body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Create a card (from AI or manually)."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        result = await session.execute(
            text(f"""
                INSERT INTO "{ctx.schema_name}".cards (user_id, parent_id, origin_session_id, type, title, fields, notes)
                VALUES (CAST(:uid AS UUID), CAST(:parent_id AS UUID), CAST(:origin_session_id AS UUID), :type, :title, CAST(:fields AS jsonb), :notes)
                RETURNING *
            """),
            {
                "uid": str(ctx.user_id),
                "parent_id": body.get("parent_id"),
                "origin_session_id": body.get("origin_session_id"),
                "type": body.get("type", "task"),
                "title": body.get("title", "Untitled"),
                "fields": json.dumps(body.get("fields") or {}),
                "notes": body.get("notes", ""),
            },
        )
        await session.commit()
        return _card_row_to_dict(result.fetchone())
    finally:
        await session.close()


@router.patch("/cards/{card_id}")
async def update_card(card_id: UUID, body: dict, ctx: OrgContext = Depends(get_org_context)):
    """Update card title, fields, or notes."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Build SET clauses dynamically
        sets, params = ["updated_at = NOW()"], {"id": str(card_id), "uid": str(ctx.user_id)}
        if "title" in body:
            sets.append("title = :title")
            params["title"] = body["title"]
        if "fields" in body:
            sets.append("fields = CAST(:fields AS jsonb)")
            params["fields"] = json.dumps(body["fields"])
        if "notes" in body:
            sets.append("notes = :notes")
            params["notes"] = body["notes"]
        if "chat_session_id" in body:
            sets.append("chat_session_id = CAST(:chat_session_id AS UUID)")
            params["chat_session_id"] = body["chat_session_id"]

        result = await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET {", ".join(sets)} WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID) RETURNING *'),
            params,
        )
        await session.commit()
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        return _card_row_to_dict(row)
    finally:
        await session.close()


@router.delete("/cards/{card_id}")
async def delete_card(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Soft-delete a card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET is_deleted = TRUE, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.post("/cards/{card_id}/restore")
async def restore_card(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Restore a soft-deleted card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET is_deleted = FALSE, updated_at = NOW() WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        await session.commit()
        return {"ok": True}
    finally:
        await session.close()


@router.get("/cards/{card_id}/session")
async def get_card_session(card_id: UUID, ctx: OrgContext = Depends(get_org_context)):
    """Get or create the discussion session for a card."""
    session = await get_tenant_session(ctx.schema_name)
    try:
        # Check if card already has a chat_session_id
        result = await session.execute(
            text(f'SELECT chat_session_id, title FROM "{ctx.schema_name}".cards WHERE id = CAST(:id AS UUID) AND user_id = CAST(:uid AS UUID)'),
            {"id": str(card_id), "uid": str(ctx.user_id)},
        )
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")

        if row.chat_session_id:
            return {"session_id": str(row.chat_session_id)}

        # Create a new session for this card
        sess_result = await session.execute(
            text(f'INSERT INTO "{ctx.schema_name}".sessions (user_id, gpt_target, title) VALUES (CAST(:uid AS UUID), \'openai\', :title) RETURNING id'),
            {"uid": str(ctx.user_id), "title": f"Card: {row.title}"},
        )
        new_session_id = str(sess_result.fetchone().id)

        # Link it back to the card
        await session.execute(
            text(f'UPDATE "{ctx.schema_name}".cards SET chat_session_id = CAST(:sid AS UUID) WHERE id = CAST(:id AS UUID)'),
            {"sid": new_session_id, "id": str(card_id)},
        )
        await session.commit()
        return {"session_id": new_session_id}
    finally:
        await session.close()
