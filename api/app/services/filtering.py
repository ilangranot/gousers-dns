import re
from dataclasses import dataclass
from typing import Optional, Literal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.services.llm import llm_service


@dataclass
class FilterResult:
    action: Literal["allow", "block", "modify"]
    reason: Optional[str] = None
    modified_content: Optional[str] = None


# ── Built-in fast regex PII patterns ──────────────────────────────────────
# Each entry: (label, compiled_regex)
_PII_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("email address",      re.compile(r"\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b")),
    ("phone number",       re.compile(r"\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")),
    ("US SSN",             re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("credit card number", re.compile(r"\b(?:\d[ -]?){13,16}\b")),
    ("IBAN",               re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b")),
    ("IP address",         re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")),
    ("passport number",    re.compile(r"\b[A-Z]{1,2}\d{6,9}\b")),
    ("date of birth",      re.compile(
        r"\b(DOB|date of birth|born on)[:\s]+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
        re.IGNORECASE,
    )),
    ("US ZIP code",        re.compile(r"\b\d{5}(?:-\d{4})?\b")),
    ("driver license",     re.compile(r"\b(DL|driver.?s?\s+licen[cs]e)[:\s#]*[A-Z0-9]{6,15}\b", re.IGNORECASE)),
]

_PII_LABEL_MAP = {label.lower(): pat for label, pat in _PII_PATTERNS}


def _detect_pii_regex(content: str, requested_types: str) -> Optional[str]:
    """Fast regex pass. Returns reason string or None."""
    if requested_types.strip().upper() == "ALL":
        patterns = _PII_PATTERNS
    else:
        types = [t.strip().lower() for t in requested_types.split(",")]
        patterns = [(lbl, pat) for lbl, pat in _PII_PATTERNS if lbl.lower() in types]

    found = [label for label, pat in patterns if pat.search(content)]
    return f"PII detected: {', '.join(found)}" if found else None


def _redact_regex(content: str, requested_types: str) -> str:
    """Best-effort regex redaction."""
    modified = content
    if requested_types.strip().upper() == "ALL":
        patterns = _PII_PATTERNS
    else:
        types = [t.strip().lower() for t in requested_types.split(",")]
        patterns = [(lbl, pat) for lbl, pat in _PII_PATTERNS if lbl.lower() in types]

    for label, pat in patterns:
        placeholder = f"[{label.upper().replace(' ', '_')}]"
        modified = pat.sub(placeholder, modified)
    return modified


def _detect_pii_presidio(content: str, requested_types: str) -> tuple[Optional[str], Optional[str]]:
    """NER pass via Presidio. Returns (reason, redacted_content) or (None, None)."""
    try:
        from app.services.presidio_service import analyze_pii, redact_pii
        hits = analyze_pii(content, requested_types)
        if hits:
            types_found = list({h["type"] for h in hits})
            reason = f"PII detected by NER: {', '.join(types_found)}"
            redacted = redact_pii(content, requested_types) or content
            return reason, redacted
        return None, None
    except Exception:
        return None, None


class FilteringService:
    async def load_rules(self, session: AsyncSession, schema: str) -> list[dict]:
        result = await session.execute(
            text(f'SELECT * FROM "{schema}".filtering_rules WHERE is_active = TRUE ORDER BY priority DESC')
        )
        return [dict(row._mapping) for row in result]

    async def evaluate(self, content: str, session: AsyncSession, schema: str) -> FilterResult:
        rules = await self.load_rules(session, schema)
        if not rules:
            return FilterResult(action="allow")

        for rule in rules:
            rtype = rule["type"]
            action = rule["action"]

            # ── keyword ───────────────────────────────────────────────────
            if rtype == "keyword":
                if rule["pattern"] and rule["pattern"].lower() in content.lower():
                    return FilterResult(action=action, reason=f"Matched keyword: {rule['pattern']}")

            # ── regex ─────────────────────────────────────────────────────
            elif rtype == "regex":
                try:
                    if rule["pattern"] and re.search(rule["pattern"], content, re.IGNORECASE):
                        return FilterResult(action=action, reason=f"Matched pattern: {rule['name']}")
                except re.error:
                    pass

            # ── pii ───────────────────────────────────────────────────────
            elif rtype == "pii":
                pii_types = rule["pattern"] or "ALL"

                # Layer 1: fast regex (structured PII like SSN, email, credit card)
                reason = _detect_pii_regex(content, pii_types)
                if reason:
                    if action == "modify":
                        return FilterResult(action="modify", reason=reason, modified_content=_redact_regex(content, pii_types))
                    return FilterResult(action=action, reason=reason)

                # Layer 2: Presidio NER (catches names, locations, organisations, etc.)
                ner_reason, redacted = _detect_pii_presidio(content, pii_types)
                if ner_reason:
                    if action == "modify":
                        return FilterResult(action="modify", reason=ner_reason, modified_content=redacted)
                    return FilterResult(action=action, reason=ner_reason)

        # ── semantic (Llama) — slow path, only if needed ──────────────────
        semantic_rules = [r for r in rules if r["type"] == "semantic"]
        if semantic_rules:
            result = await llm_service.evaluate_filter(content, semantic_rules)
            if result.get("action") in ("block", "modify"):
                return FilterResult(
                    action=result["action"],
                    reason=result.get("reason"),
                    modified_content=result.get("modified_content"),
                )

        return FilterResult(action="allow")


filtering_service = FilteringService()
