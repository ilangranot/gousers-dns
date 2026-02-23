import asyncio
import json
import ollama
from app.core.config import settings


class LLMService:
    def __init__(self):
        self.client = ollama.AsyncClient(host=settings.OLLAMA_URL)
        self.model = settings.OLLAMA_MODEL

    async def evaluate_filter(self, content: str, rules: list[dict]) -> dict:
        """Ask Llama to semantically evaluate content against rules.
        Returns: {"action": "allow"|"block"|"modify", "reason": str, "modified_content": str|None}
        """
        rules_text = "\n".join(
            [f"- [{r['name']}]: {r['pattern']}" for r in rules if r.get("pattern")]
        )
        prompt = f"""You are a strict content filter for an organization. Evaluate whether the user message violates any of the rules below.

Rules:
{rules_text}

User message to evaluate:
\"\"\"{content}\"\"\"

Instructions:
- For PII rules: look for names, addresses, phone numbers, emails, IDs, account numbers, dates of birth, medical info, or any personal details even if written informally (e.g. "my name is John", "I live at 5 Main St").
- For other rules: apply them strictly.
- If the message violates a rule with action=modify, rewrite it with the sensitive parts replaced with [REDACTED].
- If no rules are violated, respond with allow.

Respond ONLY with valid JSON, no extra text:
{{"action": "allow", "reason": null, "modified_content": null}}
{{"action": "block", "reason": "specific reason", "modified_content": null}}
{{"action": "modify", "reason": "specific reason", "modified_content": "cleaned message with [REDACTED] replacing sensitive data"}}"""

        try:
            response = await asyncio.wait_for(
                self.client.chat(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    options={"temperature": 0},
                ),
                timeout=30.0,
            )
        except (asyncio.TimeoutError, Exception):
            # Ollama unavailable or timed out — default to allow
            return {"action": "allow", "reason": None, "modified_content": None}
        raw = response["message"]["content"].strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # If Llama doesn't return clean JSON, default to allow
            return {"action": "allow", "reason": None, "modified_content": None}

    async def generate_suggestions(self, conversation: list[dict], org_context: str = "") -> list[str]:
        """Generate follow-up prompt suggestions based on the conversation."""
        history = "\n".join(
            [f"{m['role'].upper()}: {m['content'][:300]}" for m in conversation[-6:]]
        )
        prompt = f"""Based on this conversation, suggest 3 short follow-up questions or prompts the user could ask next.
{f'Organization context: {org_context}' if org_context else ''}

Conversation:
{history}

Respond ONLY with a JSON array of 3 strings, no extra text:
["suggestion 1", "suggestion 2", "suggestion 3"]"""

        try:
            response = await asyncio.wait_for(
                self.client.chat(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    options={"temperature": 0.7},
                ),
                timeout=15.0,
            )
        except (asyncio.TimeoutError, Exception):
            return []
        raw = response["message"]["content"].strip()
        try:
            suggestions = json.loads(raw)
            return suggestions[:3] if isinstance(suggestions, list) else []
        except json.JSONDecodeError:
            return []

    async def assess_usage_level(self, user_email: str, messages: list[dict], message_count: int) -> str:
        """Assess a user's AI usage level based on their recent conversations.
        Returns: "beginner" | "intermediate" | "advanced" | "power_user"
        """
        # Rule-based fallback (used when Ollama is unavailable or times out)
        def _rule_based() -> str:
            if message_count < 5:
                return "beginner"
            elif message_count < 25:
                return "intermediate"
            elif message_count < 100:
                return "advanced"
            return "power_user"

        if not messages:
            return _rule_based()

        sample = messages[-20:]  # last 20 messages
        convo = "\n".join(f"{m['role'].upper()}: {m['content'][:200]}" for m in sample)

        prompt = f"""You are assessing how effectively a user uses AI chat tools.

User: {user_email}
Total messages sent: {message_count}
Recent conversation sample:
{convo}

Rate this user's AI usage level. Consider:
- How many messages they have sent
- Complexity and depth of their questions
- How effectively they use AI (follow-ups, refinements, prompting skills)
- Breadth of topics

Respond with ONLY one of these exact words:
beginner
intermediate
advanced
power_user"""

        try:
            response = await asyncio.wait_for(
                self.client.chat(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    options={"temperature": 0},
                ),
                timeout=20.0,
            )
            level = response["message"]["content"].strip().lower().replace(" ", "_")
            if level in ("beginner", "intermediate", "advanced", "power_user"):
                return level
        except (asyncio.TimeoutError, Exception):
            pass
        return _rule_based()

    async def summarize_session(self, messages: list[dict]) -> str:
        """Generate a short title for a session."""
        first_user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        if not first_user_msg:
            return "New conversation"

        prompt = f"""Summarize this message in 5 words or less as a chat title:
"{first_user_msg[:200]}"
Respond with only the title, no punctuation."""

        try:
            response = await asyncio.wait_for(
                self.client.chat(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    options={"temperature": 0},
                ),
                timeout=15.0,
            )
        except (asyncio.TimeoutError, Exception):
            return first_user_msg[:40]
        return response["message"]["content"].strip()


llm_service = LLMService()
