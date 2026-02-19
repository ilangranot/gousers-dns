import functools
from typing import Optional

from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine


@functools.lru_cache(maxsize=1)
def _get_engines():
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
    return analyzer, anonymizer


# Map friendly rule pattern labels → Presidio entity types
ENTITY_MAP: dict[str, str] = {
    "person": "PERSON",
    "location": "LOCATION",
    "email": "EMAIL_ADDRESS",
    "email address": "EMAIL_ADDRESS",
    "phone": "PHONE_NUMBER",
    "phone number": "PHONE_NUMBER",
    "ssn": "US_SSN",
    "us ssn": "US_SSN",
    "credit card": "CREDIT_CARD",
    "credit card number": "CREDIT_CARD",
    "iban": "IBAN_CODE",
    "ip address": "IP_ADDRESS",
    "url": "URL",
    "date": "DATE_TIME",
    "nrp": "NRP",
    "medical": "MEDICAL_LICENSE",
    "us passport": "US_PASSPORT",
    "us driver license": "US_DRIVER_LICENSE",
}

# "ALL" mode uses a conservative set: excludes PERSON/LOCATION/URL/DATE_TIME
# which fire on public-figure names and general text, causing false positives.
# Admins can explicitly add "person" or "location" to their rule pattern if needed.
_SAFE_ENTITIES = {
    "EMAIL_ADDRESS", "PHONE_NUMBER", "US_SSN", "CREDIT_CARD",
    "IBAN_CODE", "IP_ADDRESS", "MEDICAL_LICENSE", "US_PASSPORT",
    "US_DRIVER_LICENSE",
}
ALL_ENTITIES = list(set(ENTITY_MAP.values()))


def analyze_pii(text: str, requested_types: str) -> list[dict]:
    """
    Run Presidio NER analysis on text.
    requested_types: "ALL" or comma-separated friendly names like "person,email address"
    Returns list of found entities with type, score, start, end, and matched text snippet.
    """
    analyzer, _ = _get_engines()

    if requested_types.strip().upper() == "ALL":
        entities = list(_SAFE_ENTITIES)  # conservative default, no PERSON/LOCATION
    else:
        types = [t.strip().lower() for t in requested_types.split(",")]
        entities = [ENTITY_MAP[t] for t in types if t in ENTITY_MAP]
        if not entities:
            entities = list(_SAFE_ENTITIES)

    results = analyzer.analyze(text=text, entities=entities, language="en")
    return [
        {
            "type": r.entity_type,
            "score": round(r.score, 2),
            "start": r.start,
            "end": r.end,
            "text": text[r.start : r.end],
        }
        for r in results
        if r.score >= 0.85  # raised threshold to reduce false positives
    ]


def redact_pii(text: str, requested_types: str) -> Optional[str]:
    """Replace detected PII with <TYPE> placeholders. Returns None if nothing was found."""
    analyzer, anonymizer = _get_engines()

    if requested_types.strip().upper() == "ALL":
        entities = list(_SAFE_ENTITIES)
    else:
        types = [t.strip().lower() for t in requested_types.split(",")]
        entities = [ENTITY_MAP[t] for t in types if t in ENTITY_MAP]
        if not entities:
            entities = list(_SAFE_ENTITIES)

    results = analyzer.analyze(text=text, entities=entities, language="en")
    if not results:
        return None

    anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
    return anonymized.text
