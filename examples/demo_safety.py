"""
End-to-end demonstration of the hardened AquaGuard pipeline (offline).

Shows:
  1. A normal assessment with a populated AIAudit object.
  2. A provider-outage run degrading safely to REVIEW_REQUIRED.
  3. Unsafe AI output (pollution diagnosis) being sanitised + flagged.
  4. PII never reaching the provider.

Run from the repository root: python examples/demo_safety.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

# Ensure box-drawing characters print on Windows consoles (cp1252 default).
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Allow running as a plain script from the repo root.
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from ai.pipeline.orchestrator import AIPipelineOrchestrator
from ai.layer_c.adaptive_questions import AdaptiveQuestionGenerator
from ai.layer_d.cross_validator import CrossValidator
from ai.schemas.base import AIEvidence
from ai.schemas.layer_a import (
    BlurResult, BrightnessResult, DuplicateResult, LayerAResult,
    OcclusionResult, StreamRelevanceResult,
)
from ai.safety import pii
from ai.utils.exceptions import AIProviderError


def _layer_a(score=85):
    class _A:
        def evaluate(self, image):
            return LayerAResult(
                quality_score=score, passed=True, routing="good", feedback=[],
                blur=BlurResult(score=90, passed=True, laplacian_variance=200.0, reason="sharp"),
                brightness=BrightnessResult(score=90, passed=True, hsv_value_mean=120.0, reason="ok"),
                occlusion=OcclusionResult(score=90, passed=True, blocked_fraction=0.1, reason="clear"),
                stream_relevance=StreamRelevanceResult(score=90, passed=True, confidence=0.9, reason="stream", provider_used="mock"),
                duplicate=DuplicateResult(is_duplicate=False, reason="unique"),
            )
    return _A()


class _LayerB:
    def __init__(self, evidence, model="gpt-4o", fallback=False, raise_exc=None):
        self._e = evidence; self.model_used = model; self.prompt_version = "layer_b_evidence_v1"
        self.fallback_used = fallback; self._raise = raise_exc
    def detect(self, ref, source_media_id=None):
        if self._raise: raise self._raise
        return self
    def to_ai_evidence(self): return list(self._e)


def _ev(ind, present=True, conf=0.9, reason="visible"):
    return AIEvidence(indicator=ind, present=present, confidence=conf, reasoning=reason)


def _orch(lb):
    return AIPipelineOrchestrator(layer_a=_layer_a(), layer_b=lb,
                                  layer_c=AdaptiveQuestionGenerator(), layer_d=CrossValidator())


def _hr(t): print("\n" + "═" * 68 + f"\n{t}\n" + "═" * 68)


def demo_normal():
    _hr("1) NORMAL ASSESSMENT — AIAudit populated")
    lb = _LayerB([_ev("turbidity", present=False, reason="clear water, bed visible")])
    out = _orch(lb).assess_observation({
        "observation_id": "obs-1", "image": np.zeros((10, 10, 3), np.uint8),
        "citizen_answers": {"water_clarity": "clear"},
    })
    print("status:", out["status"])
    print("ai_audit:", json.dumps(out["ai_audit"], indent=2))


def demo_outage():
    _hr("2) PROVIDER OUTAGE — degrades safely to REVIEW_REQUIRED")
    lb = _LayerB([], raise_exc=AIProviderError("all providers unavailable (timeout + outage)"))
    out = _orch(lb).assess_observation({"observation_id": "obs-2", "image": np.zeros((10, 10, 3), np.uint8)})
    print("status:", out["status"])
    print("degraded_mode:", out["ai_audit"]["degraded_mode"])
    print("human_review_required:", out["ai_audit"]["human_review_required"])
    print("errors:", out["ai_audit"]["errors"])


def demo_unsafe_output():
    _hr("3) UNSAFE AI OUTPUT — sanitised + flagged (never trusted)")
    lb = _LayerB([_ev("turbidity", present=True, reason="The water is polluted by discharge from the factory.")])
    out = _orch(lb).assess_observation({
        "observation_id": "obs-3", "image": np.zeros((10, 10, 3), np.uint8),
        "citizen_answers": {"water_clarity": "cloudy"},
    })
    print("status:", out["status"])
    print("degraded_mode:", out["ai_audit"]["degraded_mode"])
    print("warnings:", json.dumps(out["ai_audit"]["warnings"], indent=2))
    turb = next(e for e in out["layer_b"]["turbidity"] if False) if isinstance(out["layer_b"], dict) else None  # noqa
    # show sanitised evidence via layer_c answers path instead
    print("sanitised evidence reasoning (turbidity):")
    # evidence is embedded in layer_d supporting/conflicts; re-run guard directly for clarity
    from ai.safety.guard import sanitize_evidence
    cleaned, _ = sanitize_evidence([_ev("turbidity", present=True, reason="The water is polluted by discharge from the factory.")])
    print("  present:", cleaned[0].present, "| reasoning:", cleaned[0].reasoning)


def demo_pii():
    _hr("4) PII NEVER REACHES PROVIDER")
    raw = "My name is Jane Doe, phone +1 (555) 123-4567, at 51.5074, -0.1278"
    print("raw citizen note:", raw)
    print("scrubbed:        ", pii.redact(raw).text)


if __name__ == "__main__":
    demo_normal()
    demo_outage()
    demo_unsafe_output()
    demo_pii()
