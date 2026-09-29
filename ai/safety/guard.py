"""
Output safety guard for the AquaGuard AI pipeline.

This module inspects AI-produced free text (evidence reasoning, conflict
explanations, follow-up question text) and enforces the mandatory content
rules that a prompt alone cannot guarantee:

  - Never diagnose pollution.
  - Never claim a pollution source without evidence.
  - Never invent measurements.
  - Never make regulatory / enforcement recommendations.
  - Never identify individual citizens.
  - Never treat an AI inference as confirmed scientific fact.

The guard is DETECTION + MITIGATION, not just detection:
  - `scan_text()` returns the violation categories found.
  - `sanitize_evidence()` neutralises offending AIEvidence rows by rewriting
    their reasoning to a safe hedged form, downgrading `present` to False,
    and flagging that a human must review. It never silently keeps a
    forbidden claim.

Nothing here fabricates evidence; it only removes or hedges unsafe claims and
raises the human-review flag.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import List, Tuple

from ai.schemas.base import AIEvidence
from ai.safety.pii import contains_pii

# ── Forbidden-claim detectors ────────────────────────────────────────────────
# Each entry: (category, compiled regex, human-readable description)

_PATTERNS: List[Tuple[str, "re.Pattern[str]", str]] = [
    (
        "pollution_diagnosis",
        re.compile(
            r"\b(is|are|was|were|clearly|definitely|confirmed)\s+"
            r"(polluted|contaminated|toxic|hazardous|unsafe to drink)\b"
            r"|\b(the )?(water|stream|river) is (polluted|contaminated|toxic)\b",
            re.IGNORECASE,
        ),
        "definitive pollution/contamination diagnosis",
    ),
    (
        "pollution_source",
        re.compile(
            r"\b(caused by|due to|because of|originates? from|discharged? (from|by)|"
            r"dumped by|sourced? from)\b.*\b"
            r"(factory|industr\w+|sewage|farm|company|plant|facility|discharge|runoff)\b"
            r"|\b(industrial|agricultural|sewage) (discharge|runoff|spill) (caused|is responsible)\b",
            re.IGNORECASE,
        ),
        "unproven pollution-source attribution",
    ),
    (
        "invented_measurement",
        re.compile(
            r"\b(\d+(\.\d+)?)\s*"
            r"(ntu|ph|mg/?l|ppm|ppb|°c|degrees celsius|celsius|dissolved oxygen|"
            r"do mg|colony forming units|cfu|e\.?\s?coli count)\b"
            r"|\bph\s*(of|is|=)?\s*\d",
            re.IGNORECASE,
        ),
        "invented numeric/laboratory measurement",
    ),
    (
        "enforcement_recommendation",
        re.compile(
            r"\b(should|must|need to|recommend(ed)?|advise[d]?)\b.*\b"
            r"(fine|prosecute|penali[sz]e|report to (the )?(authorit|epa|agency|police|regulator)|"
            r"enforce|shut down|close the|legal action|sue)\b"
            r"|\b(regulatory|enforcement) action\b",
            re.IGNORECASE,
        ),
        "regulatory/enforcement recommendation",
    ),
    (
        "citizen_identification",
        re.compile(
            r"\b(the citizen|the reporter|the user|the person)\b.*\b(named|called|is|works|lives)\b"
            r"|\bidentified as [A-Z][a-z]+",
            re.IGNORECASE,
        ),
        "attempt to identify an individual citizen",
    ),
    (
        "unhedged_certainty",
        re.compile(
            r"\bit is (certain|proven|a fact|confirmed) that\b"
            r"|\bscientifically (proven|confirmed)\b"
            r"|\bthis proves\b",
            re.IGNORECASE,
        ),
        "AI inference stated as confirmed scientific fact",
    ),
]


@dataclass
class GuardResult:
    categories: List[str] = field(default_factory=list)
    messages: List[str] = field(default_factory=list)

    @property
    def violated(self) -> bool:
        return bool(self.categories)


def scan_text(text: str | None) -> GuardResult:
    """Detect forbidden claims (and PII) in a piece of AI-produced text."""
    result = GuardResult()
    if not text:
        return result

    for category, pattern, description in _PATTERNS:
        if pattern.search(text):
            result.categories.append(category)
            result.messages.append(f"Blocked {description}: '{_snippet(text)}'")

    if contains_pii(text):
        result.categories.append("pii_exposure")
        result.messages.append("AI output contained PII and was sanitised.")

    return result


def _snippet(text: str, limit: int = 80) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[:limit] + "…"


_SAFE_REASONING = (
    "Only visually observable evidence is reported; no diagnosis, source, "
    "measurement, or enforcement conclusion can be drawn from the image. "
    "Flagged for human review."
)


def sanitize_evidence(evidence: List[AIEvidence]) -> Tuple[List[AIEvidence], GuardResult]:
    """
    Scan every AIEvidence row. Any row whose reasoning violates a rule is
    neutralised:
      - reasoning replaced with a safe hedged statement,
      - present downgraded to False (we do not assert an unsafe positive),
      - confidence left as-is for transparency (the warning explains why).

    Returns (sanitized_rows, aggregate_guard_result). The aggregate result's
    `violated` flag tells the caller to force human review.
    """
    aggregate = GuardResult()
    out: List[AIEvidence] = []

    for ev in evidence:
        scan = scan_text(ev.reasoning)
        if scan.violated:
            aggregate.categories.extend(scan.categories)
            aggregate.messages.extend(
                f"[{ev.indicator}] {m}" for m in scan.messages
            )
            out.append(
                AIEvidence(
                    indicator=ev.indicator,
                    present=False,
                    confidence=ev.confidence,
                    reasoning=_SAFE_REASONING,
                    image_region=ev.image_region,
                )
            )
        else:
            out.append(ev)

    # De-duplicate categories while preserving order.
    seen = set()
    aggregate.categories = [c for c in aggregate.categories if not (c in seen or seen.add(c))]
    return out, aggregate


def sanitize_text(text: str | None) -> Tuple[str, GuardResult]:
    """
    Sanitise a single free-text string (e.g. a Layer D explanation). If any
    forbidden claim is present, the text is replaced with a safe hedged
    statement and the violation is reported.
    """
    scan = scan_text(text)
    if scan.violated:
        return (
            "A potential inconsistency was noted. This is an automated visual "
            "observation only and requires human review; no pollution, cause, "
            "or measurement is being asserted.",
            scan,
        )
    return text or "", scan
