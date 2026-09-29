"""
Tests for AquaGuard Confidence Scoring (spec Step 34 / Step 37).

Weights (spec Step 34):
    imageQuality           × 0.25
    aiEvidenceAgreement    × 0.30
    citizenConsistency     × 0.25
    gpsValidity            × 0.10
    historicalConsistency  × 0.10

aiEvidenceAgreement:
    base     = (high_conf_present_count / total_count) × 100
               high-conf: confidence >= 0.70 AND present=True
    agreement = base × mean_confidence_of_all_indicators

citizenConsistency = 100 − 15 × unresolved_conflicts (clamped ≥ 0)
gpsValidity        = <20m→100, <50m→70, else 30; 70 neutral when unknown
historicalConsistency = |z|<2→100, |z|<3→60, else 20; 50 neutral when absent

Routing (spec Step 37):
    ≥ 80  → VALID
    60–79 → REVIEW_REQUIRED
    < 60  → HUMAN_REVIEW
"""

import pytest

from ai.confidence.calculator import (
    calculate_confidence,
    _score_image_quality,
    _score_ai_evidence_agreement,
    _score_citizen_consistency,
    _score_gps_validity,
    _score_historical_consistency,
)
from ai.schemas.base import AIEvidence, FollowUpQuestion
from ai.schemas.layer_d import ConsistencyResult, ConsistencyStatus
from ai.schemas.layer_e import (
    ConfidenceRouting,
    DEFAULT_HISTORICAL_FALLBACK,
    CONFIDENCE_WEIGHTS,
    _routing_from_score,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_ev(indicator, present, confidence):
    return AIEvidence(indicator=indicator, present=present, confidence=confidence, reasoning="test")


def _make_q(qid):
    return FollowUpQuestion(id=qid, question=f"Q {qid}?", options=["Yes", "No", "Not sure"],
                            evidence_basis=[qid], priority=1)


def _consistency(score, status, conflicts=None, requires_review=None):
    return ConsistencyResult(
        status=status, score=score, conflicts=conflicts or [], supporting_evidence=[],
        historical_comparison="unavailable", explanation="t",
        requires_review=(score < 50 if requires_review is None else requires_review),
    )


# ── Worked examples (spec formula) ────────────────────────────────────────────

def test_perfect_observation():
    """
    iq=95, aea=95 (4/4 present@0.95, mean 0.95 → 100×0.95), cc=100 (0 conflicts),
    gps=100 (<20m), hist=100 (z<2)
    = 95×.25 + 95×.30 + 100×.25 + 100×.10 + 100×.10
    = 23.75 + 28.5 + 25 + 10 + 10 = 97.25 → VALID
    """
    ev = [_make_ev(f"i{i}", True, 0.95) for i in range(4)]
    r = calculate_confidence(
        95.0, ev, [_make_q("a"), _make_q("b"), _make_q("c")],
        {"a": "x", "b": "y", "c": "z"},
        _consistency(100, ConsistencyStatus.CONSISTENT),
        historical_baseline=None,
        gps_accuracy_m=5.0, historical_z_score=0.5,
    )
    assert r.confidence_score == pytest.approx(97.25, abs=0.01)
    assert r.routing == ConfidenceRouting.VALID
    assert r.components.imageQuality == pytest.approx(95.0)
    assert r.components.aiEvidenceAgreement == pytest.approx(95.0, abs=0.01)
    assert r.components.citizenConsistency == pytest.approx(100.0)
    assert r.components.gpsValidity == pytest.approx(100.0)
    assert r.components.historicalConsistency == pytest.approx(100.0)
    assert r.weights == CONFIDENCE_WEIGHTS


def test_major_conflict_lowers_citizen_consistency():
    """
    iq=80, aea=90 (2/2@0.90), cc=70 (2 unresolved conflicts → 100-30),
    gps=70 (unknown), hist=50 (no baseline)
    = 80×.25 + 90×.30 + 70×.25 + 70×.10 + 50×.10
    = 20 + 27 + 17.5 + 7 + 5 = 76.5 → REVIEW_REQUIRED
    """
    ev = [_make_ev("water_flow", True, 0.90), _make_ev("turbidity", True, 0.90)]
    r = calculate_confidence(
        80.0, ev, [_make_q("a")], {"a": "x"},
        _consistency(30, ConsistencyStatus.MAJOR_CONFLICT, conflicts=["c1", "c2"], requires_review=True),
        historical_baseline=None,
    )
    assert r.components.citizenConsistency == pytest.approx(70.0)
    assert r.confidence_score == pytest.approx(76.5, abs=0.01)
    assert r.routing == ConfidenceRouting.REVIEW_REQUIRED


def test_low_score_routes_human_review():
    """
    iq=20, aea=0 (low conf), cc=100, gps=70, hist=50
    = 5 + 0 + 25 + 7 + 5 = 42 → HUMAN_REVIEW
    """
    ev = [_make_ev("x", True, 0.40)]
    r = calculate_confidence(
        20.0, ev, [], {}, _consistency(100, ConsistencyStatus.CONSISTENT), None,
    )
    assert r.confidence_score == pytest.approx(42.0, abs=0.01)
    assert r.routing == ConfidenceRouting.HUMAN_REVIEW


# ── Missing data ──────────────────────────────────────────────────────────────

def test_missing_historical_baseline_uses_neutral_fallback():
    r = calculate_confidence(
        70.0, [_make_ev("turbidity", True, 0.85)], [], {},
        _consistency(100, ConsistencyStatus.CONSISTENT), historical_baseline=None,
    )
    assert r.historical_baseline_used is False
    assert r.components.historicalConsistency == pytest.approx(DEFAULT_HISTORICAL_FALLBACK)
    assert any("NOT inflated" in n for n in r.missing_data_notes)


def test_missing_gps_uses_neutral_not_inflated():
    r = calculate_confidence(
        70.0, [_make_ev("turbidity", True, 0.85)], [], {},
        _consistency(100, ConsistencyStatus.CONSISTENT), None, gps_accuracy_m=None,
    )
    assert r.components.gpsValidity == pytest.approx(70.0)
    assert any("gpsValidity" in n for n in r.missing_data_notes)


def test_empty_evidence_zero_agreement():
    r = calculate_confidence(
        90.0, [], [], {}, _consistency(100, ConsistencyStatus.CONSISTENT), None,
    )
    assert r.components.aiEvidenceAgreement == pytest.approx(0.0)


# ── Component scorers ─────────────────────────────────────────────────────────

class TestImageQualityScorer:
    def test_passthrough(self):
        assert _score_image_quality(78.0) == pytest.approx(78.0)

    def test_clamp(self):
        assert _score_image_quality(150.0) == pytest.approx(100.0)
        assert _score_image_quality(-10.0) == pytest.approx(0.0)


class TestEvidenceAgreementScorer:
    def test_empty_zero(self):
        assert _score_ai_evidence_agreement([]) == pytest.approx(0.0)

    def test_all_high_conf(self):
        ev = [_make_ev("x", True, 0.90), _make_ev("y", True, 0.90)]
        assert _score_ai_evidence_agreement(ev) == pytest.approx(90.0, abs=0.01)

    def test_low_conf_zero(self):
        assert _score_ai_evidence_agreement([_make_ev("x", True, 0.40)]) == pytest.approx(0.0)

    def test_mixed(self):
        ev = [_make_ev("x", True, 0.80), _make_ev("y", False, 0.60)]
        # high_conf_present=1, total=2 → base 50; mean_conf 0.70 → 35
        assert _score_ai_evidence_agreement(ev) == pytest.approx(35.0, abs=0.01)


class TestCitizenConsistencyScorer:
    def test_no_conflicts_100(self):
        cr = _consistency(100, ConsistencyStatus.CONSISTENT)
        assert _score_citizen_consistency(cr, None) == pytest.approx(100.0)

    def test_explicit_count(self):
        cr = _consistency(100, ConsistencyStatus.CONSISTENT)
        assert _score_citizen_consistency(cr, 2) == pytest.approx(70.0)

    def test_derived_from_layer_d(self):
        cr = _consistency(30, ConsistencyStatus.MAJOR_CONFLICT, conflicts=["a"], requires_review=True)
        assert _score_citizen_consistency(cr, None) == pytest.approx(85.0)

    def test_clamped_at_zero(self):
        cr = _consistency(0, ConsistencyStatus.MAJOR_CONFLICT)
        assert _score_citizen_consistency(cr, 10) == pytest.approx(0.0)


class TestGpsValidityScorer:
    def test_good(self):
        assert _score_gps_validity(10.0, []) == pytest.approx(100.0)

    def test_fair(self):
        assert _score_gps_validity(35.0, []) == pytest.approx(70.0)

    def test_poor(self):
        assert _score_gps_validity(80.0, []) == pytest.approx(30.0)

    def test_unknown_neutral(self):
        notes = []
        assert _score_gps_validity(None, notes) == pytest.approx(70.0)
        assert notes


class TestHistoricalConsistencyScorer:
    def test_z_below_2(self):
        s, used = _score_historical_consistency(1.0, None, {}, [])
        assert s == pytest.approx(100.0) and used is True

    def test_z_below_3(self):
        s, _ = _score_historical_consistency(2.5, None, {}, [])
        assert s == pytest.approx(60.0)

    def test_z_high(self):
        s, _ = _score_historical_consistency(4.0, None, {}, [])
        assert s == pytest.approx(20.0)

    def test_legacy_overlap_used_when_no_z(self):
        s, used = _score_historical_consistency(None, {"flow": "flowing"}, {"flow": "flowing"}, [])
        assert s == pytest.approx(100.0) and used is True

    def test_neutral_when_nothing(self):
        s, used = _score_historical_consistency(None, None, {}, [])
        assert s == pytest.approx(DEFAULT_HISTORICAL_FALLBACK) and used is False


# ── Routing boundaries (spec Step 37) ─────────────────────────────────────────

def test_boundary_59_human_review():
    assert _routing_from_score(59.99) == ConfidenceRouting.HUMAN_REVIEW


def test_boundary_60_review():
    assert _routing_from_score(60.0) == ConfidenceRouting.REVIEW_REQUIRED


def test_boundary_79_review():
    assert _routing_from_score(79.99) == ConfidenceRouting.REVIEW_REQUIRED


def test_boundary_80_valid():
    assert _routing_from_score(80.0) == ConfidenceRouting.VALID


def test_weights_sum_to_one():
    assert sum(CONFIDENCE_WEIGHTS.values()) == pytest.approx(1.0, abs=1e-9)


def test_result_has_all_five_components():
    r = calculate_confidence(60.0, [_make_ev("t", True, 0.85)], [], {},
                             _consistency(100, ConsistencyStatus.CONSISTENT), None)
    for attr in ("imageQuality", "aiEvidenceAgreement", "citizenConsistency",
                 "gpsValidity", "historicalConsistency"):
        assert hasattr(r.components, attr)


if __name__ == "__main__":
    pytest.main(["-v", __file__])
