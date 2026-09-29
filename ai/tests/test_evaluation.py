"""
Tests for the Layer B evaluation harness (spec Day-5 deliverable).

These verify the metric MATHS is correct with synthetic predictions/labels.
They do NOT validate the model on real imagery (none ships in the repo).
"""

from __future__ import annotations

import json

import pytest

from ai.evaluation.dataset import load_labels
from ai.evaluation.metrics import BinaryCounts, evaluate_layer_b
from ai.schemas.base import AIEvidence


def _ev(indicator, present):
    return AIEvidence(indicator=indicator, present=present, confidence=0.9, reasoning="t")


class TestBinaryCounts:
    def test_precision_recall_f1(self):
        c = BinaryCounts(tp=8, fp=2, fn=2, tn=8)
        assert c.precision() == pytest.approx(0.8)
        assert c.recall() == pytest.approx(0.8)
        assert c.f1() == pytest.approx(0.8)
        assert c.support() == 10

    def test_zero_division_safe(self):
        c = BinaryCounts()
        assert c.precision() == 0.0 and c.recall() == 0.0 and c.f1() == 0.0


class TestEvaluateLayerB:
    def test_perfect_predictions_positive_indicators(self):
        # Both indicators are positive in truth and correctly predicted → F1 1.0.
        preds = [[_ev("turbidity", True), _ev("algal_bloom", True)]]
        truth = [{"turbidity": True, "algal_bloom": True}]
        report = evaluate_layer_b(preds, truth)
        assert report.per_indicator["turbidity"]["precision"] == pytest.approx(1.0)
        assert report.per_indicator["turbidity"]["recall"] == pytest.approx(1.0)
        assert report.macro_f1 == pytest.approx(1.0)
        assert report.n_samples == 1

    def test_true_negative_indicator_has_zero_f1_support(self):
        # An indicator that is negative in truth and correctly predicted absent
        # is a true negative: precision/recall/F1 are 0 (no positives), support 0.
        preds = [[_ev("debris", False)]]
        truth = [{"debris": False}]
        report = evaluate_layer_b(preds, truth)
        assert report.per_indicator["debris"]["f1"] == pytest.approx(0.0)
        assert report.per_indicator["debris"]["support"] == pytest.approx(0.0)

    def test_false_positive_lowers_precision(self):
        # Predict debris present, truth absent → FP.
        preds = [[_ev("debris", True)]]
        truth = [{"debris": False}]
        report = evaluate_layer_b(preds, truth)
        assert report.per_indicator["debris"]["precision"] == pytest.approx(0.0)

    def test_false_negative_lowers_recall(self):
        # Predict turbidity absent, truth present → FN.
        preds = [[_ev("turbidity", False)]]
        truth = [{"turbidity": True}]
        report = evaluate_layer_b(preds, truth)
        assert report.per_indicator["turbidity"]["recall"] == pytest.approx(0.0)

    def test_missing_prediction_treated_as_absent(self):
        # Indicator labelled present but not predicted at all → FN.
        preds = [[_ev("debris", True)]]
        truth = [{"algal_bloom": True}]
        report = evaluate_layer_b(preds, truth)
        assert report.per_indicator["algal_bloom"]["recall"] == pytest.approx(0.0)

    def test_length_mismatch_raises(self):
        with pytest.raises(ValueError):
            evaluate_layer_b([[]], [])

    def test_validated_flag_default_false(self):
        report = evaluate_layer_b([[_ev("t", True)]], [{"t": True}])
        assert report.validated_on_real_imagery is False
        assert report.as_dict()["validated_on_real_imagery"] is False

    def test_multi_image_macro_average(self):
        preds = [
            [_ev("turbidity", True), _ev("debris", True)],
            [_ev("turbidity", False), _ev("debris", True)],
        ]
        truth = [
            {"turbidity": True, "debris": True},
            {"turbidity": True, "debris": True},
        ]
        report = evaluate_layer_b(preds, truth)
        # turbidity: tp=1, fn=1 → recall 0.5, precision 1.0
        assert report.per_indicator["turbidity"]["recall"] == pytest.approx(0.5)
        # debris: tp=2 → precision/recall 1.0
        assert report.per_indicator["debris"]["f1"] == pytest.approx(1.0)


class TestDatasetLoader:
    def test_missing_file_returns_empty(self, tmp_path):
        assert load_labels(tmp_path / "labels.json") == []

    def test_loads_labels(self, tmp_path):
        p = tmp_path / "labels.json"
        p.write_text(json.dumps({
            "images": [
                {"file": "a.jpg", "labels": {"turbidity": True, "debris": False}},
            ]
        }), encoding="utf-8")
        items = load_labels(p)
        assert len(items) == 1
        assert items[0].file == "a.jpg"
        assert items[0].labels == {"turbidity": True, "debris": False}


if __name__ == "__main__":
    pytest.main(["-v", __file__])
