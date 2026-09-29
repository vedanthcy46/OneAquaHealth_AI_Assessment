"""
AquaGuard Confidence Scoring Calculator.

Aligned to AQUAGUARD_BUILD_PLAN.md Step 34 / Step 37.

Public entry point
──────────────────
    calculate_confidence(
        image_quality_score  : float,               # Layer A composite, 0–100
        evidence             : List[AIEvidence],     # Layer B output
        questions            : List[FollowUpQuestion],  # Layer C output (context)
        citizen_answers      : Dict[str, Any],       # citizen question responses
        consistency_result   : ConsistencyResult,    # Layer D output
        historical_baseline  : Optional[Dict[str, Any]] = None,
        *,
        unresolved_conflicts : Optional[int] = None, # count of open citizen/AI conflicts
        gps_accuracy_m       : Optional[float] = None,   # GPS accuracy in metres
        historical_z_score   : Optional[float] = None,   # |z| vs site baseline
    ) -> LayerEResult

Formula (Step 34):
    Confidence =
        (imageQuality          × 0.25)
      + (aiEvidenceAgreement   × 0.30)
      + (citizenConsistency    × 0.25)
      + (gpsValidity           × 0.10)
      + (historicalConsistency × 0.10)

Component derivation
────────────────────
1. imageQuality — Layer A composite, clamped to 0–100.

2. aiEvidenceAgreement — how information-rich AND self-consistent the AI
   evidence is:
     base     = (high-confidence present indicators / total) × 100
                high-conf: confidence >= 0.70 AND present=True
     agreement = base × mean_confidence_of_all_indicators
   Empty evidence → 0.0.

3. citizenConsistency — spec formula: 100 − 15 × (unresolved conflicts).
   If `unresolved_conflicts` is not provided, it is derived from the Layer D
   ConsistencyResult (its `conflicts` list when it requires review). Clamped ≥ 0.

4. gpsValidity — spec: <20m → 100, <50m → 70, else 30.
   If accuracy is unknown, a neutral 70 is used and a note is recorded
   (NOT inflated to 100).

5. historicalConsistency — spec: |z| < 2 → 100, |z| < 3 → 60, else 20.
   If no z-score is available, the calculator will attempt a legacy
   string-overlap estimate against `historical_baseline`; if neither is
   available it falls back to DEFAULT_HISTORICAL_FALLBACK (50, neutral) with a
   recorded note.

Routing (Step 37): ≥80 VALID · 60–79 REVIEW_REQUIRED · <60 HUMAN_REVIEW.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ai.schemas.base import AIEvidence, FollowUpQuestion
from ai.schemas.layer_d import ConsistencyResult
from ai.schemas.layer_e import (
    CITIZEN_CONFLICT_PENALTY,
    CONFIDENCE_WEIGHTS,
    DEFAULT_HISTORICAL_FALLBACK,
    GPS_FAIR_M,
    GPS_FAIR_SCORE,
    GPS_GOOD_M,
    GPS_GOOD_SCORE,
    GPS_POOR_SCORE,
    GPS_UNKNOWN_SCORE,
    ConfidenceComponents,
    ConfidenceRouting,
    LayerEResult,
    _routing_from_score,
)
from ai.utils.logger import get_logger

logger = get_logger(__name__)

_HIGH_CONF_THRESHOLD = 0.70


# ─────────────────────────────────────────────
# Component scorers (each returns 0.0–100.0)
# ─────────────────────────────────────────────

def _score_image_quality(image_quality_score: float) -> float:
    return float(max(0.0, min(100.0, image_quality_score)))


def _score_ai_evidence_agreement(evidence: List[AIEvidence]) -> float:
    """
    Information richness × mean confidence of AI evidence. Empty → 0.

    "Not assessed" indicators (confidence == 0.0 AND not present) are excluded
    from the denominator: an indicator the model was never asked about — or
    could not assess — should neither inflate nor penalise the score. This
    keeps the metric stable as the indicator set grows (6 → 10) without
    changing behaviour for indicators that were actually evaluated.
    """
    assessed = [
        ev for ev in evidence
        if not (ev.confidence == 0.0 and not ev.present)
    ]
    if not assessed:
        return 0.0
    total = len(assessed)
    high_conf_present = sum(
        1 for ev in assessed if ev.present and ev.confidence >= _HIGH_CONF_THRESHOLD
    )
    mean_conf = sum(ev.confidence for ev in assessed) / total
    base = (high_conf_present / total) * 100.0
    return float(max(0.0, min(100.0, base * mean_conf)))


# Backward-compatible alias (older tests import this name).
_score_evidence_richness = _score_ai_evidence_agreement


def _score_question_completeness(
    questions: List[FollowUpQuestion], citizen_answers: Dict[str, Any]
) -> float:
    """Retained as a diagnostic helper (not a weighted spec factor)."""
    if not questions:
        return 100.0
    answered = 0
    for q in questions:
        val = citizen_answers.get(q.id)
        if val is not None and val != "" and val != [] and val != {}:
            answered += 1
    return float(answered / len(questions) * 100.0)


def _score_answer_image_consistency(consistency_result: ConsistencyResult) -> float:
    """Layer D consistency score pass-through (used to derive citizenConsistency)."""
    return float(max(0.0, min(100.0, consistency_result.score)))


def _score_citizen_consistency(
    consistency_result: ConsistencyResult, unresolved_conflicts: Optional[int]
) -> float:
    """
    Spec Step 34: citizenConsistency = 100 − 15 × unresolved_conflicts, clamped ≥ 0.

    If an explicit count is not supplied, derive it from Layer D: the number of
    conflicts when the result requires review.
    """
    if unresolved_conflicts is None:
        unresolved_conflicts = (
            len(consistency_result.conflicts)
            if consistency_result.requires_review else 0
        )
    score = 100.0 - CITIZEN_CONFLICT_PENALTY * max(0, int(unresolved_conflicts))
    return float(max(0.0, min(100.0, score)))


def _score_gps_validity(gps_accuracy_m: Optional[float], notes: List[str]) -> float:
    """Spec Step 34 GPS scoring; neutral 70 (documented) when unknown."""
    if gps_accuracy_m is None:
        notes.append(
            "gpsValidity: GPS accuracy not provided. "
            f"Neutral score {GPS_UNKNOWN_SCORE:.0f} applied (NOT inflated to 100)."
        )
        return GPS_UNKNOWN_SCORE
    if gps_accuracy_m < GPS_GOOD_M:
        return GPS_GOOD_SCORE
    if gps_accuracy_m < GPS_FAIR_M:
        return GPS_FAIR_SCORE
    return GPS_POOR_SCORE


def _legacy_historical_overlap(
    historical_baseline: Optional[Dict[str, Any]], citizen_answers: Dict[str, Any]
) -> Optional[float]:
    """String-overlap estimate used only when no z-score is available."""
    if not historical_baseline:
        return None
    compared = matched = 0
    for key, baseline_val in historical_baseline.items():
        citizen_val = citizen_answers.get(key)
        if citizen_val is None:
            continue
        compared += 1
        if str(citizen_val).strip().lower() == str(baseline_val).strip().lower():
            matched += 1
    if compared == 0:
        return None
    return (matched / compared) * 100.0


def _score_historical_consistency(
    historical_z_score: Optional[float],
    historical_baseline: Optional[Dict[str, Any]],
    citizen_answers: Dict[str, Any],
    notes: List[str],
) -> tuple[float, bool]:
    """
    Returns (score, baseline_used).

    Preference order:
      1. z-score (spec): |z|<2 → 100, |z|<3 → 60, else 20.
      2. legacy string overlap vs baseline dict.
      3. neutral fallback (50), NOT inflated.
    """
    if historical_z_score is not None:
        z = abs(historical_z_score)
        score = 100.0 if z < 2.0 else (60.0 if z < 3.0 else 20.0)
        return score, True

    overlap = _legacy_historical_overlap(historical_baseline, citizen_answers)
    if overlap is not None:
        notes.append(
            "historicalConsistency: no z-score supplied; used string-overlap "
            "estimate against baseline (approximate)."
        )
        return float(overlap), True

    notes.append(
        "historicalConsistency: no baseline/z-score available. "
        f"Neutral fallback {DEFAULT_HISTORICAL_FALLBACK:.0f} applied (NOT inflated)."
    )
    return DEFAULT_HISTORICAL_FALLBACK, False


# Backward-compatible wrapper for older tests that import this symbol.
def _score_historical_site_consistency(
    historical_baseline: Optional[Dict[str, Any]],
    citizen_answers: Dict[str, Any],
    notes: List[str],
) -> tuple[float, bool]:
    return _score_historical_consistency(None, historical_baseline, citizen_answers, notes)


# ─────────────────────────────────────────────
# Main public function
# ─────────────────────────────────────────────

def calculate_confidence(
    image_quality_score: float,
    evidence: List[AIEvidence],
    questions: List[FollowUpQuestion],
    citizen_answers: Dict[str, Any],
    consistency_result: ConsistencyResult,
    historical_baseline: Optional[Dict[str, Any]] = None,
    *,
    unresolved_conflicts: Optional[int] = None,
    gps_accuracy_m: Optional[float] = None,
    historical_z_score: Optional[float] = None,
) -> LayerEResult:
    """Calculate the AquaGuard observation confidence score (spec Step 34/37)."""
    notes: List[str] = []

    iq = _score_image_quality(image_quality_score)
    aea = _score_ai_evidence_agreement(evidence)
    cc = _score_citizen_consistency(consistency_result, unresolved_conflicts)
    gps = _score_gps_validity(gps_accuracy_m, notes)
    hist, baseline_used = _score_historical_consistency(
        historical_z_score, historical_baseline, citizen_answers, notes
    )

    raw = (
        iq   * CONFIDENCE_WEIGHTS["imageQuality"]
        + aea  * CONFIDENCE_WEIGHTS["aiEvidenceAgreement"]
        + cc   * CONFIDENCE_WEIGHTS["citizenConsistency"]
        + gps  * CONFIDENCE_WEIGHTS["gpsValidity"]
        + hist * CONFIDENCE_WEIGHTS["historicalConsistency"]
    )
    confidence_score = round(max(0.0, min(100.0, raw)), 2)
    routing = _routing_from_score(confidence_score)

    logger.info(
        "Confidence: score=%s | routing=%s | iq=%.1f aea=%.1f cc=%.1f gps=%.1f hist=%.1f",
        confidence_score, routing.value, iq, aea, cc, gps, hist,
    )

    return LayerEResult(
        confidence_score=confidence_score,
        routing=routing,
        components=ConfidenceComponents(
            imageQuality=round(iq, 2),
            aiEvidenceAgreement=round(aea, 2),
            citizenConsistency=round(cc, 2),
            gpsValidity=round(gps, 2),
            historicalConsistency=round(hist, 2),
        ),
        weights=dict(CONFIDENCE_WEIGHTS),
        historical_baseline_used=baseline_used,
        missing_data_notes=notes,
    )
