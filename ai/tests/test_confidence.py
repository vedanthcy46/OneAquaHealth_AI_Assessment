"""
Tests for Phase 5 — AquaGuard Confidence Scoring.

Manual verification calculations are embedded inline so that results can be
checked by reading the test file alone, without running any code.

Weights (from spec):
    image_quality              × 0.25
    evidence_richness          × 0.30
    question_completeness      × 0.15
    answer_image_consistency   × 0.20
    historical_site_consistency× 0.10

Evidence richness formula:
    base    = (high_conf_present_count / total_count) × 100
              high-conf: confidence >= 0.70 AND present=True
    richness = base × mean_confidence_of_all_indicators

historical_site_consistency:
    No baseline → fallback = 50.0 (documented neutral, NOT 100)
    With baseline → (matched_keys / compared_keys) × 100

Routing:
    [0, 50)   → REVIEW_REQUIRED
    [50, 75)  → VALID_MODERATE
    [75, 100] → VALID_HIGH
"""

import pytest
from typing import Any, Dict, List, Optional

from ai.confidence.calculator import (
    calculate_confidence,
    _score_image_quality,
    _score_evidence_richness,
    _score_question_completeness,
    _score_answer_image_consistency,
    _score_historical_site_consistency,
)
from ai.schemas.base import AIEvidence, FollowUpQuestion
from ai.schemas.layer_d import ConsistencyResult, ConsistencyStatus
from ai.schemas.layer_e import (
    ConfidenceRouting,
    DEFAULT_HISTORICAL_FALLBACK,
    CONFIDENCE_WEIGHTS,
)


# ─────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────

def _make_ev(indicator: str, present: bool, confidence: float) -> AIEvidence:
    return AIEvidence(
        indicator=indicator,
        present=present,
        confidence=confidence,
        reasoning="test evidence",
    )


def _make_q(qid: str, required: bool = False) -> FollowUpQuestion:
    return FollowUpQuestion(
        id=qid,
        question=f"Question about {qid}?",
        options=["Yes", "No", "Not sure"],
        evidence_basis=[qid],
        priority=1,
        required=required,
    )


def _make_consistency(score: int, status: ConsistencyStatus) -> ConsistencyResult:
    return ConsistencyResult(
        status=status,
        score=score,
        conflicts=[],
        supporting_evidence=[],
        historical_comparison="unavailable",
        explanation="test",
        requires_review=(score < 50),
    )


# ─────────────────────────────────────────────
# Test 1 — Perfect observation
# ─────────────────────────────────────────────

def test_perfect_observation():
    """
    MANUAL CALCULATION — Perfect observation
    ─────────────────────────────────────────
    Inputs:
      image_quality_score = 95.0
      evidence: 4 indicators, all present=True, confidence=0.95
        → high_conf_present_count = 4, total = 4
        → base = (4/4) × 100 = 100.0
        → mean_conf = 0.95
        → evidence_richness = 100.0 × 0.95 = 95.0
      questions: 3 questions; all 3 answered
        → completeness = (3/3) × 100 = 100.0
      consistency_result.score = 100 (CONSISTENT)
        → answer_image_consistency = 100.0
      historical_baseline: {"turbidity": "clear", "flow": "flowing"}
        citizen_answers: {"turbidity": "clear", "flow": "flowing"}
        → matched=2, compared=2 → historical = 100.0

    Formula:
      = 95.0×0.25 + 95.0×0.30 + 100.0×0.15 + 100.0×0.20 + 100.0×0.10
      = 23.75   + 28.50    + 15.00     + 20.00      + 10.00
      = 97.25

    Routing: 97.25 ≥ 75 → VALID_HIGH
    """
    evidence = [
        _make_ev("turbidity", True, 0.95),
        _make_ev("debris", True, 0.95),
        _make_ev("algal_bloom", True, 0.95),
        _make_ev("flow_condition", True, 0.95),
    ]
    questions = [_make_q("algae_smell"), _make_q("debris_type"), _make_q("turbidity_appearance")]
    citizen_answers = {
        "algae_smell": "Earthy or plant-like",
        "debris_type": "Plastic or packaging",
        "turbidity_appearance": "Slightly cloudy",
        "turbidity": "clear",
        "flow": "flowing",
    }
    result = calculate_confidence(
        image_quality_score=95.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline={"turbidity": "clear", "flow": "flowing"},
    )

    assert result.confidence_score == pytest.approx(97.25, abs=0.01)
    assert result.routing == ConfidenceRouting.VALID_HIGH
    assert result.historical_baseline_used is True
    assert result.missing_data_notes == []
    assert result.components.image_quality == pytest.approx(95.0, abs=0.01)
    assert result.components.evidence_richness == pytest.approx(95.0, abs=0.01)
    assert result.components.question_completeness == pytest.approx(100.0, abs=0.01)
    assert result.components.answer_image_consistency == pytest.approx(100.0, abs=0.01)
    assert result.components.historical_site_consistency == pytest.approx(100.0, abs=0.01)
    # Weights must be unchanged
    assert result.weights == CONFIDENCE_WEIGHTS


# ─────────────────────────────────────────────
# Test 2 — Poor image quality
# ─────────────────────────────────────────────

def test_poor_image_quality():
    """
    MANUAL CALCULATION — Poor image quality
    ────────────────────────────────────────
    Inputs:
      image_quality_score = 20.0    (blurry, dark, occluded)
      evidence: 2 indicators, both present=True, confidence=0.85
        → high_conf_present_count = 2, total = 2
        → base = (2/2) × 100 = 100.0
        → mean_conf = 0.85
        → evidence_richness = 100.0 × 0.85 = 85.0
      questions: 2 questions; both answered
        → completeness = (2/2) × 100 = 100.0
      consistency_result.score = 100 (CONSISTENT)
      historical_baseline: present and matching
        → historical_site_consistency = 100.0

    Formula:
      = 20.0×0.25 + 85.0×0.30 + 100.0×0.15 + 100.0×0.20 + 100.0×0.10
      = 5.00     + 25.50    + 15.00     + 20.00      + 10.00
      = 75.50

    Routing: 75.50 ≥ 75 → VALID_HIGH
    Note: low image quality is dragging the score down significantly despite
    all other components being perfect.
    """
    evidence = [
        _make_ev("turbidity", True, 0.85),
        _make_ev("debris", True, 0.85),
    ]
    questions = [_make_q("algae_smell"), _make_q("debris_type")]
    citizen_answers = {
        "algae_smell": "No unusual smell",
        "debris_type": "Leaves or plants",
        "clarity": "clear",
    }
    result = calculate_confidence(
        image_quality_score=20.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline={"clarity": "clear"},
    )

    assert result.confidence_score == pytest.approx(75.50, abs=0.01)
    assert result.routing == ConfidenceRouting.VALID_HIGH
    assert result.components.image_quality == pytest.approx(20.0, abs=0.01)


# ─────────────────────────────────────────────
# Test 3 — Rich evidence (many high-conf indicators)
# ─────────────────────────────────────────────

def test_rich_evidence():
    """
    MANUAL CALCULATION — Rich evidence
    ───────────────────────────────────
    Inputs:
      image_quality_score = 80.0
      evidence: 6 indicators, all present=True, confidence=1.0
        → high_conf_present_count = 6, total = 6
        → base = (6/6) × 100 = 100.0
        → mean_conf = 1.0
        → evidence_richness = 100.0 × 1.0 = 100.0
      questions: 3 questions; all answered
        → completeness = 100.0
      consistency_result.score = 100 (CONSISTENT)
      historical_baseline: None → fallback = 50.0

    Formula:
      = 80.0×0.25 + 100.0×0.30 + 100.0×0.15 + 100.0×0.20 + 50.0×0.10
      = 20.00    + 30.00     + 15.00     + 20.00      + 5.00
      = 90.00

    Routing: 90.0 ≥ 75 → VALID_HIGH
    """
    evidence = [
        _make_ev("turbidity",           True, 1.0),
        _make_ev("debris",              True, 1.0),
        _make_ev("algal_bloom",         True, 1.0),
        _make_ev("riparian_vegetation", True, 1.0),
        _make_ev("concrete_channel",    True, 1.0),
        _make_ev("flow_condition",      True, 1.0),
    ]
    questions = [_make_q("algae_smell"), _make_q("debris_type"), _make_q("turbidity_appearance")]
    citizen_answers = {
        "algae_smell": "Earthy or plant-like",
        "debris_type": "Plastic or packaging",
        "turbidity_appearance": "Very murky",
    }
    result = calculate_confidence(
        image_quality_score=80.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
    )

    assert result.confidence_score == pytest.approx(90.0, abs=0.01)
    assert result.routing == ConfidenceRouting.VALID_HIGH
    assert result.components.evidence_richness == pytest.approx(100.0, abs=0.01)
    assert result.historical_baseline_used is False
    assert len(result.missing_data_notes) == 1
    assert "No baseline available" in result.missing_data_notes[0]
    assert str(int(DEFAULT_HISTORICAL_FALLBACK)) in result.missing_data_notes[0]   # note says "50"


# ─────────────────────────────────────────────
# Test 4 — Incomplete questions
# ─────────────────────────────────────────────

def test_incomplete_questions():
    """
    MANUAL CALCULATION — Incomplete questions (1 of 3 answered)
    ────────────────────────────────────────────────────────────
    Inputs:
      image_quality_score = 75.0
      evidence: 2 indicators, high-conf, present
        → base = (2/2)×100 = 100.0, mean_conf = 0.80
        → evidence_richness = 100.0 × 0.80 = 80.0
      questions: 3 questions; only 1 answered
        → completeness = (1/3) × 100 ≈ 33.33
      consistency_result.score = 100
      historical_baseline: {"flow": "flowing"}
        citizen_answers has "flow" matching
        → historical_site_consistency = 100.0

    Formula:
      = 75.0×0.25 + 80.0×0.30 + 33.33×0.15 + 100.0×0.20 + 100.0×0.10
      = 18.75    + 24.00    + 5.00      + 20.00      + 10.00
      = 77.75

    Routing: 77.75 ≥ 75 → VALID_HIGH
    (Still valid but question_completeness strongly suppressed the score)
    """
    evidence = [
        _make_ev("turbidity", True, 0.80),
        _make_ev("debris", True, 0.80),
    ]
    questions = [_make_q("algae_smell"), _make_q("debris_type"), _make_q("turbidity_appearance")]
    citizen_answers = {
        "algae_smell": "No unusual smell",   # only 1 answered
        "flow": "flowing",
    }
    result = calculate_confidence(
        image_quality_score=75.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline={"flow": "flowing"},
    )

    assert result.components.question_completeness == pytest.approx(100.0 / 3, abs=0.5)
    assert result.confidence_score == pytest.approx(77.75, abs=0.5)
    assert result.routing == ConfidenceRouting.VALID_HIGH


# ─────────────────────────────────────────────
# Test 5 — Major conflict (cross-validation failure)
# ─────────────────────────────────────────────

def test_major_conflict():
    """
    MANUAL CALCULATION — Major conflict (answer-image inconsistency)
    ─────────────────────────────────────────────────────────────────
    Inputs:
      image_quality_score = 80.0
      evidence: 2 indicators, high-conf, present
        → base = (2/2)×100 = 100.0, mean_conf = 0.90
        → evidence_richness = 100.0 × 0.90 = 90.0
      questions: 2 questions; both answered
        → completeness = 100.0
      consistency_result.score = 30 (MAJOR_CONFLICT)
        → answer_image_consistency = 30.0
      historical_baseline: None → fallback = 50.0

    Formula:
      = 80.0×0.25 + 90.0×0.30 + 100.0×0.15 + 30.0×0.20 + 50.0×0.10
      = 20.00    + 27.00    + 15.00     + 6.00      + 5.00
      = 73.00

    Routing: 50 ≤ 73.0 < 75 → VALID_MODERATE
    """
    evidence = [
        _make_ev("water_flow", True, 0.90),
        _make_ev("turbidity", True, 0.90),
    ]
    questions = [_make_q("algae_smell"), _make_q("turbidity_appearance")]
    citizen_answers = {
        "algae_smell": "Chemical or sewage-like",
        "turbidity_appearance": "Clear",
    }
    result = calculate_confidence(
        image_quality_score=80.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(30, ConsistencyStatus.MAJOR_CONFLICT),
        historical_baseline=None,
    )

    assert result.confidence_score == pytest.approx(73.0, abs=0.01)
    assert result.routing == ConfidenceRouting.VALID_MODERATE
    assert result.components.answer_image_consistency == pytest.approx(30.0, abs=0.01)


# ─────────────────────────────────────────────
# Test 6 — Missing historical baseline
# ─────────────────────────────────────────────

def test_missing_historical_baseline():
    """
    Validates that when historical_baseline is None:
    - historical_site_consistency = DEFAULT_HISTORICAL_FALLBACK (50.0), NOT 100
    - historical_baseline_used = False
    - A meaningful note is appended to missing_data_notes
    - The note explicitly states the fallback was NOT set to a high value
    """
    evidence = [_make_ev("turbidity", True, 0.85)]
    questions = [_make_q("turbidity_appearance")]
    citizen_answers = {"turbidity_appearance": "Slightly cloudy"}

    result = calculate_confidence(
        image_quality_score=70.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
    )

    assert result.historical_baseline_used is False
    assert result.components.historical_site_consistency == pytest.approx(
        DEFAULT_HISTORICAL_FALLBACK, abs=0.01
    )
    assert len(result.missing_data_notes) >= 1
    note = result.missing_data_notes[0]
    # Note must acknowledge absence AND document the fallback explicitly
    assert "No baseline" in note or "no baseline" in note.lower()
    assert str(int(DEFAULT_HISTORICAL_FALLBACK)) in note   # "50"
    assert "NOT" in note or "not" in note.lower()


# ─────────────────────────────────────────────
# Test 7 — Mixed-quality observation
# ─────────────────────────────────────────────

def test_mixed_quality_observation():
    """
    MANUAL CALCULATION — Mixed quality (moderate across all components)
    ────────────────────────────────────────────────────────────────────
    Inputs:
      image_quality_score = 55.0
      evidence: 3 indicators (2 high-conf present, 1 low-conf)
        high-conf present: turbidity (conf=0.80, present=True),
                           debris    (conf=0.75, present=True)
        low-conf:          algal_bloom (conf=0.50, present=False)
        → high_conf_present_count = 2, total = 3
        → base = (2/3) × 100 ≈ 66.67
        → mean_conf = (0.80 + 0.75 + 0.50) / 3 ≈ 0.6833
        → evidence_richness = 66.67 × 0.6833 ≈ 45.55
      questions: 3 questions; 2 of 3 answered
        → completeness = (2/3) × 100 ≈ 66.67
      consistency_result.score = 70 (MINOR_CONFLICT)
        → answer_image_consistency = 70.0
      historical_baseline: {"flow": "flowing"}
        citizen_answers: {"flow": "stagnant"}   → no match
        → matched=0, compared=1 → historical_site_consistency = 0.0

    Formula:
      = 55.0×0.25 + 45.55×0.30 + 66.67×0.15 + 70.0×0.20 + 0.0×0.10
      = 13.75     + 13.67      + 10.00      + 14.00     + 0.00
      = 51.42

    Routing: 50 ≤ 51.42 < 75 → VALID_MODERATE
    """
    evidence = [
        _make_ev("turbidity",   True,  0.80),
        _make_ev("debris",      True,  0.75),
        _make_ev("algal_bloom", False, 0.50),
    ]
    questions = [_make_q("algae_smell"), _make_q("debris_type"), _make_q("turbidity_appearance")]
    citizen_answers = {
        "algae_smell": "No unusual smell",
        "debris_type": "Leaves or plants",
        # turbidity_appearance left unanswered
        "flow": "stagnant",
    }
    result = calculate_confidence(
        image_quality_score=55.0,
        evidence=evidence,
        questions=questions,
        citizen_answers=citizen_answers,
        consistency_result=_make_consistency(70, ConsistencyStatus.MINOR_CONFLICT),
        historical_baseline={"flow": "flowing"},
    )

    assert result.routing == ConfidenceRouting.VALID_MODERATE
    assert result.confidence_score == pytest.approx(51.42, abs=0.5)
    assert result.components.historical_site_consistency == pytest.approx(0.0, abs=0.01)
    assert result.historical_baseline_used is True


# ─────────────────────────────────────────────
# Unit tests for individual component scorers
# ─────────────────────────────────────────────

class TestImageQualityScorer:
    def test_passthrough(self):
        assert _score_image_quality(78.0) == pytest.approx(78.0)

    def test_clamp_above_100(self):
        assert _score_image_quality(150.0) == pytest.approx(100.0)

    def test_clamp_below_0(self):
        assert _score_image_quality(-10.0) == pytest.approx(0.0)


class TestEvidenceRichnessScorer:
    def test_empty_evidence_returns_zero(self):
        assert _score_evidence_richness([]) == pytest.approx(0.0)

    def test_all_high_conf_present(self):
        ev = [_make_ev("x", True, 0.90), _make_ev("y", True, 0.90)]
        # base = (2/2)×100 = 100, mean_conf = 0.90 → 90.0
        assert _score_evidence_richness(ev) == pytest.approx(90.0, abs=0.01)

    def test_low_confidence_reduces_score(self):
        ev = [_make_ev("x", True, 0.40)]
        # confidence < 0.70 → not high-conf → base = 0
        assert _score_evidence_richness(ev) == pytest.approx(0.0, abs=0.01)

    def test_mixed_confidence(self):
        ev = [_make_ev("x", True, 0.80), _make_ev("y", False, 0.60)]
        # high_conf_present = 1 (x), total = 2
        # base = (1/2)×100 = 50.0, mean_conf = 0.70 → 35.0
        assert _score_evidence_richness(ev) == pytest.approx(35.0, abs=0.01)


class TestQuestionCompletenessScorer:
    def test_no_questions_returns_100(self):
        assert _score_question_completeness([], {}) == pytest.approx(100.0)

    def test_all_answered(self):
        qs = [_make_q("a"), _make_q("b")]
        answers = {"a": "yes", "b": "no"}
        assert _score_question_completeness(qs, answers) == pytest.approx(100.0)

    def test_none_answered(self):
        qs = [_make_q("a"), _make_q("b")]
        assert _score_question_completeness(qs, {}) == pytest.approx(0.0)

    def test_partial_answered(self):
        qs = [_make_q("a"), _make_q("b"), _make_q("c"), _make_q("d")]
        answers = {"a": "yes", "c": "maybe"}
        assert _score_question_completeness(qs, answers) == pytest.approx(50.0)

    def test_empty_string_not_counted(self):
        qs = [_make_q("a")]
        assert _score_question_completeness(qs, {"a": ""}) == pytest.approx(0.0)

    def test_none_value_not_counted(self):
        qs = [_make_q("a")]
        assert _score_question_completeness(qs, {"a": None}) == pytest.approx(0.0)


class TestAnswerImageConsistencyScorer:
    def test_consistent_passes_through(self):
        cr = _make_consistency(100, ConsistencyStatus.CONSISTENT)
        assert _score_answer_image_consistency(cr) == pytest.approx(100.0)

    def test_major_conflict_passes_through(self):
        cr = _make_consistency(30, ConsistencyStatus.MAJOR_CONFLICT)
        assert _score_answer_image_consistency(cr) == pytest.approx(30.0)

    def test_minor_conflict_passes_through(self):
        cr = _make_consistency(70, ConsistencyStatus.MINOR_CONFLICT)
        assert _score_answer_image_consistency(cr) == pytest.approx(70.0)


class TestHistoricalSiteConsistencyScorer:
    def _run(self, baseline, answers) -> tuple:
        notes: list = []
        score, used = _score_historical_site_consistency(baseline, answers, notes)
        return score, used, notes

    def test_no_baseline_returns_fallback(self):
        score, used, notes = self._run(None, {"flow": "flowing"})
        assert score == pytest.approx(DEFAULT_HISTORICAL_FALLBACK)
        assert used is False
        assert len(notes) == 1
        assert "No baseline" in notes[0]

    def test_empty_baseline_returns_fallback(self):
        score, used, notes = self._run({}, {"flow": "flowing"})
        assert score == pytest.approx(DEFAULT_HISTORICAL_FALLBACK)
        assert used is False

    def test_perfect_match(self):
        score, used, notes = self._run(
            {"flow": "flowing", "clarity": "clear"},
            {"flow": "flowing", "clarity": "clear"},
        )
        assert score == pytest.approx(100.0)
        assert used is True
        assert notes == []

    def test_no_overlap_returns_neutral(self):
        score, used, notes = self._run(
            {"flow": "flowing"},
            {"unrelated_key": "value"},
        )
        assert score == pytest.approx(DEFAULT_HISTORICAL_FALLBACK)
        assert used is True  # baseline was present, just no overlap
        assert len(notes) == 1

    def test_partial_match(self):
        score, used, notes = self._run(
            {"flow": "flowing", "clarity": "clear", "smell": "none"},
            {"flow": "flowing", "clarity": "murky", "smell": "none"},
        )
        # matched=2 (flow + smell), compared=3 → 66.67
        assert score == pytest.approx(66.67, abs=0.5)
        assert used is True

    def test_case_insensitive_match(self):
        score, used, notes = self._run(
            {"flow": "Flowing"},
            {"flow": "flowing"},
        )
        assert score == pytest.approx(100.0)

    def test_no_match(self):
        score, used, notes = self._run(
            {"flow": "flowing"},
            {"flow": "dry"},
        )
        assert score == pytest.approx(0.0)


# ─────────────────────────────────────────────
# Schema invariant tests
# ─────────────────────────────────────────────

def test_weights_sum_to_one():
    """Weights must sum exactly to 1.0 — invariant enforced at import time."""
    total = sum(CONFIDENCE_WEIGHTS.values())
    assert total == pytest.approx(1.0, abs=1e-9)


def test_weights_unchanged_by_calculator():
    """calculate_confidence must not mutate or override the weight constants."""
    evidence = [_make_ev("turbidity", True, 0.80)]
    result = calculate_confidence(
        image_quality_score=70.0,
        evidence=evidence,
        questions=[],
        citizen_answers={},
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
    )
    assert result.weights == CONFIDENCE_WEIGHTS


def test_routing_boundary_at_50():
    """Score of exactly 50.0 must route to VALID_MODERATE (not REVIEW_REQUIRED)."""
    from ai.schemas.layer_e import _routing_from_score, ConfidenceRouting
    assert _routing_from_score(50.0) == ConfidenceRouting.VALID_MODERATE
    assert _routing_from_score(49.99) == ConfidenceRouting.REVIEW_REQUIRED


def test_routing_boundary_at_75():
    """Score of exactly 75.0 must route to VALID_HIGH (not VALID_MODERATE)."""
    from ai.schemas.layer_e import _routing_from_score, ConfidenceRouting
    assert _routing_from_score(75.0) == ConfidenceRouting.VALID_HIGH
    assert _routing_from_score(74.99) == ConfidenceRouting.VALID_MODERATE


def test_result_contains_all_five_components():
    """LayerEResult.components must expose all five expected keys."""
    evidence = [_make_ev("turbidity", True, 0.85)]
    result = calculate_confidence(
        image_quality_score=60.0,
        evidence=evidence,
        questions=[],
        citizen_answers={},
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
    )
    assert hasattr(result.components, "image_quality")
    assert hasattr(result.components, "evidence_richness")
    assert hasattr(result.components, "question_completeness")
    assert hasattr(result.components, "answer_image_consistency")
    assert hasattr(result.components, "historical_site_consistency")


def test_no_evidence_reduces_richness_to_zero():
    """Empty evidence list → evidence_richness = 0, heavily impacting score."""
    result = calculate_confidence(
        image_quality_score=90.0,
        evidence=[],
        questions=[],
        citizen_answers={},
        consistency_result=_make_consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
    )
    assert result.components.evidence_richness == pytest.approx(0.0)


# ─────────────────────────────────────────────
# Manual Calculation Verification Summary
# ─────────────────────────────────────────────
#
# EXAMPLE A — Perfect observation (see test_perfect_observation)
# ──────────────────────────────────────────────────────────────
# iq=95, er=95, qc=100, aic=100, hsc=100
# = 95×0.25 + 95×0.30 + 100×0.15 + 100×0.20 + 100×0.10
# = 23.75  + 28.50   + 15.00    + 20.00     + 10.00
# = 97.25  → VALID_HIGH ✓
#
# EXAMPLE B — Major conflict (see test_major_conflict)
# ─────────────────────────────────────────────────────
# iq=80, er=90, qc=100, aic=30, hsc=50(fallback)
# = 80×0.25 + 90×0.30 + 100×0.15 + 30×0.20 + 50×0.10
# = 20.00  + 27.00   + 15.00    + 6.00     + 5.00
# = 73.00  → VALID_MODERATE ✓
#
# EXAMPLE C — Mixed quality (see test_mixed_quality_observation)
# ──────────────────────────────────────────────────────────────
# iq=55, er≈45.55, qc≈66.67, aic=70, hsc=0 (baseline mismatch)
# = 55×0.25 + 45.55×0.30 + 66.67×0.15 + 70×0.20 + 0×0.10
# = 13.75  + 13.67      + 10.00      + 14.00   + 0.00
# ≈ 51.42  → VALID_MODERATE ✓
#
# All three verified in pytest tests above.

if __name__ == "__main__":
    pytest.main(["-v", __file__])
