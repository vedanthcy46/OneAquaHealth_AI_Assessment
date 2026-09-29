"""
PII redaction for the AquaGuard AI pipeline.

Two mandatory safety rules are enforced here:
  - Never expose PII to the AI provider.
  - Never identify individual citizens.

Any free text that could reach a provider prompt (citizen notes) or that
could be embedded in AI-visible content is passed through `redact()` first.
The redactor is deliberately conservative: it replaces detected PII with a
typed placeholder (e.g. "[REDACTED_EMAIL]") rather than dropping it, so the
surrounding meaning is preserved for the model while the sensitive value is
removed.

Detected categories:
  - email addresses
  - phone numbers (international/US-style)
  - URLs
  - precise GPS coordinates (lat, lon pairs)
  - street addresses (number + street-type keyword)
  - person names introduced by an identifying phrase
    ("my name is X", "I am X", "reported by X", "contact X")

This is heuristic, not a guarantee of perfect PII removal — the pipeline
treats it as a defence-in-depth layer, and structured citizen fields are
never sent to the provider at all (only the image + the fixed prompt are).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"\b(?:https?://|www\.)\S+", re.IGNORECASE)
_PHONE_RE = re.compile(
    r"(?<!\d)(?:\+?\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){2,4}\d{2,4}(?!\d)"
)
_COORD_RE = re.compile(
    r"[-+]?\d{1,3}\.\d{3,}\s*[,;]\s*[-+]?\d{1,3}\.\d{3,}"
)
_ADDRESS_RE = re.compile(
    r"\b\d{1,5}\s+[A-Za-z0-9.\s]{1,40}?\b"
    r"(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|drive|dr\.?|court|ct\.?|"
    r"boulevard|blvd\.?|way|close|crescent|terrace)\b",
    re.IGNORECASE,
)
_NAME_RE = re.compile(
    r"(?i:\b(?:my name is|i am|i'm|this is|reported by|contact|from)\s+)"
    r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})",
)


@dataclass
class RedactionResult:
    text: str
    categories: List[str] = field(default_factory=list)

    @property
    def redacted(self) -> bool:
        return bool(self.categories)


def redact(text: str | None) -> RedactionResult:
    """
    Redact PII from free text. Returns the cleaned text plus the list of
    categories that were redacted (useful for audit warnings).

    Order matters: URLs and emails are removed before phone/coord/address so
    their digits are not mistaken for phone numbers.
    """
    if not text:
        return RedactionResult(text=text or "", categories=[])

    categories: List[str] = []
    cleaned = text

    def _sub(pattern: re.Pattern, placeholder: str, label: str, value: str) -> str:
        if pattern.search(value):
            if label not in categories:
                categories.append(label)
            return pattern.sub(placeholder, value)
        return value

    cleaned = _sub(_URL_RE, "[REDACTED_URL]", "url", cleaned)
    cleaned = _sub(_EMAIL_RE, "[REDACTED_EMAIL]", "email", cleaned)

    # Name handling preserves the introducing phrase but drops the captured name.
    if _NAME_RE.search(cleaned):
        if "name" not in categories:
            categories.append("name")

        def _replace_name(m: re.Match) -> str:
            prefix = m.group(0)[: m.start(1) - m.start(0)]
            return prefix + "[REDACTED_NAME]"

        cleaned = _NAME_RE.sub(_replace_name, cleaned)

    cleaned = _sub(_COORD_RE, "[REDACTED_COORDINATES]", "coordinates", cleaned)
    cleaned = _sub(_ADDRESS_RE, "[REDACTED_ADDRESS]", "address", cleaned)
    cleaned = _sub(_PHONE_RE, "[REDACTED_PHONE]", "phone", cleaned)

    return RedactionResult(text=cleaned, categories=categories)


def contains_pii(text: str | None) -> bool:
    """Fast boolean check used by tests and guards."""
    return redact(text).redacted
