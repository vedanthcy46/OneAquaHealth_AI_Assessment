"""
Phase 5 — AquaGuard Confidence Scoring Calculator.

Public entry point
──────────────────
    calculate_confidence(
        image_quality_score      : float,          # Layer A output, 0–100
        evidence                 : List[AIEvidence],  # Layer B output
        questions                : List[FollowUpQuestion],  # Layer C output
        citizen_answers          : Dict[str, Any],  # citizen question responses
        consistency_result       : ConsistencyResult,  # Layer D output
        historical_baseline      : Optional[Dict[str, Any]] = None,
    ) -> LayerEResult

Formula (locked — do not change weights):
    Confidence =
        (ImageQuality              × 0.25)
      + (EvidenceRichness          × 0.30)
      + (QuestionCompleteness      × 0.15)
      + (AnswerImageConsistency    × 0.20)
      + (HistoricalSiteConsistency × 0.10)

Component derivation
────────────────────
1. image_quality (0–100)
   Directly taken from Layer A's composite quality_score.
   No transformation applied.

2. evidence_richness (0–100)
   Measures how information-dense the AI evidence is.
   Formula:
     base    = (number of high-confidence indicators / total indicators) × 100
     high-confidence: confidence >= 0.70 AND present=True
     richness = base × mean_confidence_of_all_indicators
   Where mean_confidence is the mean of `confidence` across all AIEvidence rows.
   If evidence list is empty → richness = 0.

3. question_completeness (0–100)
   If no questions were generated → 100.0 (nothing to answer).
   Otherwise:
     answered = number of questions whose `id` appears as a key in citizen_answers
                AND the value is non-empty / non-None
     completeness = (answered / total_questions) × 100

4. answer_image_consistency (0–100)
   Directly taken from ConsistencyResult.score (Layer D).
   Score is already 0–100 from the deterministic rule engine.

5. historical_site_consistency (0–100)
   If historical_baseline is None or empty:
     → fallback = DEFAULT_HISTORICAL_FALLBACK (50.0, neutral)
     → missing_data_notes appended, historical_baseline_used = False
   Otherwise, computed from how many baseline keys match the current
   citizen answers:
     matched_fraction = matched_keys / total_baseline_keys
     score = matched_fraction × 100
   Where a key "matches" if the citizen answer equals the baseline value
   (case-insensitive string comparison).
   If no baseline keys overlap with citizen_answers → score = 50 (neutral,
   insufficient overlap to judge; also documented in missing_data_notes).

Routing
───────
  [0.0, 50.0)  → REVIEW_REQUIRED
  [50.0, 75.0) → VALID_MODERATE
  [75.0, 100.0]→ VALID_HIGH
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ai.schemas.base import AIEvidence, FollowUpQuestion
from ai.schemas.layer_d import ConsistencyResult
from ai.schemas.layer_e import (
    CONFIDENCE_WEIGHTS,
    DEFAULT_HISTORICAL_FALLBACK,
    ConfidenceComponents,
    ConfidenceRouting,
    LayerEResult,
    _routing_from_score,
)
from ai.utils.logger import get_logger

logger = get_logger(__name__)

# High-confidence threshold for evidence richness computation.
_HIGH_CONF_THRESHOLD = 0.70


# ─────────────────────────────────────────────
# Component scorers (each returns 0.0–100.0)
# ─────────────────────────────────────────────

def _score_image_quality(image_quality_score: float) -> float:
    """
    Pass-through from Layer A composite score.
    Clamped to [0, 100] as a safety measure only.
    """
    return float(max(0.0, min(100.0, image_quality_score)))


def _score_evidence_richness(evidence: List[AIEvidence]) -> float:
    """
    Measures how informationally dense the AI-detected evidence is.

    Algorithm:
      1. Count 'high-confidence present' indicators
         (confidence >= 0.70 AND present=True).
      2. base = (high_conf_present_count / total_count) × 100
      3. mean_conf = mean of ALL indicators' confidence values
      4. richness = base × mean_conf

    Rationale: A set of 6 indicators where 5 are high-confidence and present
    conveys far more usable information than 1 high-confidence indicator out of 6.
    Multiplying by mean_conf penalises wholesale uncertain evidence.

    Edge case: empty evidence list → 0.0.
    """
    if not evidence:
        return 0.0

    total = len(evidence)
    high_conf_present = sum(
        1 for ev in evidence
        if ev.present and ev.confidence >= _HIGH_CONF_THRESHOLD
    )
    mean_conf = sum(ev.confidence for ev in evidence) / total

    base = (high_conf_present / total) * 100.0
    richness = base * mean_conf
    return float(max(0.0, min(100.0, richness)))


def _score_question_completeness(
    questions: List[FollowUpQuestion],
    citizen_answers: Dict[str, Any],
) -> float:
    """
    Fraction of generated questions that have been answered.

    Rules:
    • If no questions were generated → 100.0 (nothing was required).
    • An answer counts as 'present' if:
        - question.id is a key in citizen_answers, AND
        - the value is not None, not empty string, and not an empty container.
    • Completeness = (answered / total) × 100
    """
    if not questions:
        return 100.0

    answered = 0
    for q in questions:
        val = citizen_answers.get(q.id)
        if val is not None and val != "" and val != [] and val != {}:
            answered += 1

    return float(answered / len(questions) * 100.0)


def _score_answer_image_consistency(consistency_result: ConsistencyResult) -> float:
    """
    Pass-through from Layer D ConsistencyResult.score.
    Already normalised to 0–100 by the cross-validator deterministic rules.
    """
    return float(max(0.0, min(100.0, consistency_result.score)))


def _score_historical_site_consistency(
    historical_baseline: Optional[Dict[str, Any]],
    citizen_answers: Dict[str, Any],
    notes: List[str],
) -> tuple[float, bool]:
    """
    Returns (score: float, baseline_was_used: bool).

    When baseline is unavailable
    ─────────────────────────────
    Returns DEFAULT_HISTORICAL_FALLBACK (50.0) and appends an explanatory
    note. Does NOT assign 100 or 0 to avoid false-high or false-low distortion.

    When baseline is available
    ──────────────────────────
    For every key in the baseline that also appears in citizen_answers:
      • match  → +1 to matched count
      • no match → not counted
    score = (matched / compared) × 100
    If no baseline keys overlap with citizen_answers, 50.0 is returned
    (neutral — insufficient overlap to score) and a note is appended.
    """
    if not historical_baseline:
        notes.append(
            "historical_site_consistency: No baseline available. "
            f"Fallback value of {DEFAULT_HISTORICAL_FALLBACK} (neutral) applied. "
            "Score was NOT defaulted to high to avoid inflating confidence."
        )
        return DEFAULT_HISTORICAL_FALLBACK, False

    compared = 0
    matched = 0
    for key, baseline_val in historical_baseline.items():
        citizen_val = citizen_answers.get(key)
        if citizen_val is None:
            continue
        compared += 1
        if str(citizen_val).strip().lower() == str(baseline_val).strip().lower():
            matched += 1

    if compared == 0:
        notes.append(
            "historical_site_consistency: Baseline present but no citizen answers "
            "overlap with baseline keys. Fallback value of "
            f"{DEFAULT_HISTORICAL_FALLBACK} (neutral) applied."
        )
        return DEFAULT_HISTORICAL_FALLBACK, True

    score = (matched / compared) * 100.0
    return float(score), True


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
) -> LayerEResult:
    """
    Calculate the AquaGuard observation confidence score.

    Parameters
    ──────────
    image_quality_score : Layer A composite quality score, 0–100.
    evidence            : List of AIEvidence rows from Layer B.
    questions           : Follow-up questions generated by Layer C.
    citizen_answers     : Dict mapping question IDs to citizen responses.
    consistency_result  : ConsistencyResult from Layer D (cross-validator).
    historical_baseline : Optional site-level baseline dict. May be None or {}.

    Returns
    ───────
    LayerEResult with confidence_score, routing, components, weights,
    historical_baseline_used, and missing_data_notes.
    """
    missing_notes: List[str] = []

    # ── Step 1: Score each component ─────────────────────────────────────────
    iq   = _score_image_quality(image_quality_score)
    er   = _score_evidence_richness(evidence)
    qc   = _score_question_completeness(questions, citizen_answers)
    aic  = _score_answer_image_consistency(consistency_result)
    hsc, baseline_used = _score_historical_site_consistency(
        historical_baseline, citizen_answers, missing_notes
    )

    # ── Step 2: Apply formula ─────────────────────────────────────────────────
    raw_score = (
        iq  * CONFIDENCE_WEIGHTS["image_quality"]
        + er  * CONFIDENCE_WEIGHTS["evidence_richness"]
        + qc  * CONFIDENCE_WEIGHTS["question_completeness"]
        + aic * CONFIDENCE_WEIGHTS["answer_image_consistency"]
        + hsc * CONFIDENCE_WEIGHTS["historical_site_consistency"]
    )
    confidence_score = round(max(0.0, min(100.0, raw_score)), 2)

    # ── Step 3: Routing ───────────────────────────────────────────────────────
    routing = _routing_from_score(confidence_score)

    logger.info(
        f"Confidence: score={confidence_score} | routing={routing.value} | "
        f"iq={iq:.1f} er={er:.1f} qc={qc:.1f} aic={aic:.1f} hsc={hsc:.1f}"
    )

    return LayerEResult(
        confidence_score=confidence_score,
        routing=routing,
        components=ConfidenceComponents(
            image_quality=round(iq, 2),
            evidence_richness=round(er, 2),
            question_completeness=round(qc, 2),
            answer_image_consistency=round(aic, 2),
            historical_site_consistency=round(hsc, 2),
        ),
        weights=dict(CONFIDENCE_WEIGHTS),
        historical_baseline_used=baseline_used,
        missing_data_notes=missing_notes,
    )
