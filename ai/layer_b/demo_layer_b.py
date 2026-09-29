"""
Layer B demonstration script (offline, no real API calls).

Run from the workspace root:
    python -m ai.layer_b.demo_layer_b

It demonstrates, using fake providers that mimic OpenAI/Gemini:
  1. An example structured LayerBResult (+ AIEvidence rows).
  2. How an OpenAI failure automatically triggers the Gemini fallback.
  3. The exact prompt version being used.
"""

from __future__ import annotations

import json

from ai.layer_b.evidence_detector import EcologicalEvidenceDetector
from ai.prompts.versions import LAYER_B_PROMPT_VERSION, get_layer_b_prompt
from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.utils.exceptions import AIProviderError


# ── Fake providers standing in for real OpenAI / Gemini SDK calls ───────────────

class _FakeOpenAI(VisionEvidenceProvider):
    def __init__(self, payload: dict | None, fail: bool = False):
        self._payload = payload
        self._fail = fail

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return "gpt-4o"

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        if self._fail:
            raise AIProviderError("simulated OpenAI timeout / outage")
        return VisionResponse(json.dumps(self._payload), "openai", "gpt-4o")


class _FakeGemini(VisionEvidenceProvider):
    def __init__(self, payload: dict):
        self._payload = payload

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return "gemini-1.5-pro"

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        return VisionResponse(json.dumps(self._payload), "gemini", "gemini-1.5-pro")


_EXAMPLE_PAYLOAD = {
    "turbidity": {"value": "murky", "confidence": 0.87, "evidence": "Water appears murky; streambed not visible.", "uncertainty": None},
    "debris": {"value": "present", "confidence": 0.72, "evidence": "Scattered material visible on the surface.", "uncertainty": None, "estimated_coverage_pct": 20.0},
    "algal_bloom": {"value": "absent", "confidence": 0.6, "evidence": "No green surface coverage observed.", "uncertainty": "Partial glare on the surface.", "severity": "unknown"},
    "riparian_vegetation": {"value": "dense", "confidence": 0.94, "evidence": "Bankside vegetation clearly visible.", "uncertainty": None},
    "concrete_channel": {"value": "absent", "confidence": 0.8, "evidence": "Natural rock and gravel banks.", "uncertainty": None},
    "flow_condition": {"value": "flowing", "confidence": 0.7, "evidence": "Surface ripples suggest movement.", "uncertainty": None},
}


def _hr(title: str) -> None:
    print("\n" + "═" * 70)
    print(title)
    print("═" * 70)


def demo_structured_output() -> None:
    _hr("1) EXAMPLE STRUCTURED OUTPUT (primary = OpenAI succeeds)")
    det = EcologicalEvidenceDetector(_FakeOpenAI(_EXAMPLE_PAYLOAD), fallbacks=[_FakeGemini(_EXAMPLE_PAYLOAD)])
    result = det.detect("stream_photo.jpg", source_media_id="media-001")

    print(result.model_dump_json(indent=2))

    print("\n-- AIEvidence-compatible rows (for DB / downstream layers) --")
    for row in result.to_ai_evidence():
        flag = "present" if row.present else "not-present"
        print(f"  [{flag:11}] {row.indicator:20} conf={row.confidence:.2f}  {row.reasoning}")


def demo_fallback() -> None:
    _hr("2) OPENAI FAILURE → AUTOMATIC GEMINI FALLBACK")
    primary = _FakeOpenAI(None, fail=True)          # OpenAI blows up
    fallback = _FakeGemini(_EXAMPLE_PAYLOAD)         # Gemini answers
    det = EcologicalEvidenceDetector(primary, fallbacks=[fallback], max_retries=2)

    result = det.detect("stream_photo.jpg", source_media_id="media-001")
    print(f"provider_used : {result.provider_used}")
    print(f"model_used    : {result.model_used}")
    print(f"fallback_used : {result.fallback_used}")
    print(f"turbidity     : {result.turbidity.value.value} (conf {result.turbidity.confidence})")


def demo_prompt_version() -> None:
    _hr("3) EXACT PROMPT VERSION IN USE")
    print(f"LAYER_B_PROMPT_VERSION = {LAYER_B_PROMPT_VERSION!r}")
    prompt = get_layer_b_prompt(LAYER_B_PROMPT_VERSION)
    print("\n-- prompt preview (first 12 lines) --")
    for line in prompt.splitlines()[:12]:
        print(f"  {line}")
    print("  ...")


if __name__ == "__main__":
    demo_structured_output()
    demo_fallback()
    demo_prompt_version()
