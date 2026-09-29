"""
Evaluation metrics for AquaGuard Layer B (spec Day-5 deliverable).

Computes per-indicator and macro precision / recall / F1 by comparing the
pipeline's predicted `present` flag for each ecological indicator against a
human-labelled ground truth.

IMPORTANT — validation status
──────────────────────────────
The metric maths here is unit-tested with synthetic data and is correct. It is
NOT yet run against real stream imagery: doing so requires a labelled dataset
of real photographs (spec target: 20 labelled images) plus live/mocked vision
providers. Until that dataset exists, any reported numbers are illustrative
only, NOT a validated model-quality claim.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Mapping, Sequence

from ai.schemas.base import AIEvidence


@dataclass
class BinaryCounts:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 0.0

    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 0.0

    def f1(self) -> float:
        p, r = self.precision(), self.recall()
        return (2 * p * r / (p + r)) if (p + r) else 0.0

    def support(self) -> int:
        return self.tp + self.fn


@dataclass
class EvaluationReport:
    per_indicator: Dict[str, Dict[str, float]] = field(default_factory=dict)
    macro_precision: float = 0.0
    macro_recall: float = 0.0
    macro_f1: float = 0.0
    n_samples: int = 0
    validated_on_real_imagery: bool = False

    def as_dict(self) -> Dict[str, object]:
        return {
            "n_samples": self.n_samples,
            "macro_precision": round(self.macro_precision, 4),
            "macro_recall": round(self.macro_recall, 4),
            "macro_f1": round(self.macro_f1, 4),
            "per_indicator": {
                k: {m: round(v, 4) for m, v in stats.items()}
                for k, stats in self.per_indicator.items()
            },
            "validated_on_real_imagery": self.validated_on_real_imagery,
        }


def _predicted_present(evidence: Sequence[AIEvidence]) -> Dict[str, bool]:
    """Map indicator name → predicted present flag from a Layer B evidence list."""
    return {ev.indicator: bool(ev.present) for ev in evidence}


def evaluate_layer_b(
    predictions: Sequence[Sequence[AIEvidence]],
    ground_truth: Sequence[Mapping[str, bool]],
    *,
    validated_on_real_imagery: bool = False,
) -> EvaluationReport:
    """
    Compute precision/recall/F1 for Layer B `present` predictions.

    Args:
        predictions  : list of per-image AIEvidence lists (pipeline output).
        ground_truth : list of {indicator: present_bool} label dicts, aligned
                       by index with `predictions`.
        validated_on_real_imagery: set True ONLY when the inputs are real
                       labelled stream photographs (honest provenance flag).

    Only indicators that appear in a given image's ground truth are scored for
    that image (so optional/unassessed indicators don't distort recall).
    """
    if len(predictions) != len(ground_truth):
        raise ValueError("predictions and ground_truth must be the same length")

    counts: Dict[str, BinaryCounts] = {}

    for pred_evidence, truth in zip(predictions, ground_truth):
        pred = _predicted_present(pred_evidence)
        for indicator, actual in truth.items():
            c = counts.setdefault(indicator, BinaryCounts())
            predicted = pred.get(indicator, False)
            if predicted and actual:
                c.tp += 1
            elif predicted and not actual:
                c.fp += 1
            elif not predicted and actual:
                c.fn += 1
            else:
                c.tn += 1

    per_indicator: Dict[str, Dict[str, float]] = {}
    for indicator, c in counts.items():
        per_indicator[indicator] = {
            "precision": c.precision(),
            "recall": c.recall(),
            "f1": c.f1(),
            "support": float(c.support()),
        }

    if per_indicator:
        macro_p = sum(s["precision"] for s in per_indicator.values()) / len(per_indicator)
        macro_r = sum(s["recall"] for s in per_indicator.values()) / len(per_indicator)
        macro_f = sum(s["f1"] for s in per_indicator.values()) / len(per_indicator)
    else:
        macro_p = macro_r = macro_f = 0.0

    return EvaluationReport(
        per_indicator=per_indicator,
        macro_precision=macro_p,
        macro_recall=macro_r,
        macro_f1=macro_f,
        n_samples=len(predictions),
        validated_on_real_imagery=validated_on_real_imagery,
    )
