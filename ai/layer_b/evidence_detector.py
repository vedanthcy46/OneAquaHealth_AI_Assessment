"""
Layer B — Ecological Evidence Detector.

Responsibilities (all vendor-agnostic):
  - Drive a chain of VisionEvidenceProviders (primary → fallbacks).
  - Retry each provider a configurable number of times.
  - Parse the raw model text into JSON, tolerating common malformations
    (markdown fences, leading/trailing prose).
  - Validate against the strict LayerBResult / indicator schemas.
  - Stamp provenance: model_used, provider_used, prompt_version, fallback_used.
  - Never depend on a single provider: if OpenAI fails, Gemini is tried
    automatically.

The detector exposes both:
  - detect(...)          → the rich, structured LayerBResult, and
  - detect_evidence(...) → List[AIEvidence] (storage/DB-compatible), matching
                           the original method signature on this class.

If EVERY provider fails, the detector raises AIProviderError. It never
fabricates evidence to hide a provider outage.
"""

from __future__ import annotations

import json
import re
import time
from typing import List, Optional, Sequence

from pydantic import ValidationError

from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.prompts.versions import LAYER_B_PROMPT_VERSION, get_layer_b_prompt
from ai.schemas.base import AIEvidence
from ai.schemas.layer_b import LAYER_B_MODEL_FIELDS, LayerBResult
from ai.utils.exceptions import AIProviderError
from ai.utils.logger import get_logger

logger = get_logger(__name__)

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)


def _extract_json(raw: str) -> dict:
    """
    Best-effort recovery of a JSON object from model output.

    Handles:
      - clean JSON,
      - JSON wrapped in ```json ... ``` fences,
      - JSON with leading/trailing prose (extracts the outermost {...}).

    Raises:
        AIProviderError if no parseable JSON object can be recovered.
    """
    if raw is None:
        raise AIProviderError("Model returned no content to parse.")

    text = raw.strip()

    # Strip markdown code fences if present.
    text = _FENCE_RE.sub("", text).strip()

    # Fast path.
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass

    # Fallback: grab the outermost brace-delimited region.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError as exc:
            raise AIProviderError(f"Malformed JSON in model output: {exc}") from exc

    raise AIProviderError("No JSON object found in model output.")


class EcologicalEvidenceDetector:
    """
    Layer B detector with automatic provider fallback.

    Args:
        provider   : primary VisionEvidenceProvider.
        fallbacks  : ordered fallback providers (tried if the primary fails).
        prompt_version: which versioned Layer B prompt to use.
        max_retries: attempts PER provider before moving to the next.
    """

    def __init__(
        self,
        provider: VisionEvidenceProvider,
        fallbacks: Optional[Sequence[VisionEvidenceProvider]] = None,
        prompt_version: str = LAYER_B_PROMPT_VERSION,
        max_retries: int = 2,
    ):
        self.provider = provider
        self.fallbacks: List[VisionEvidenceProvider] = list(fallbacks or [])
        self.prompt_version = prompt_version
        self.max_retries = max(1, int(max_retries))

    # ── Public API ────────────────────────────────────────────────────────────

    def detect(self, image_path: str, source_media_id: Optional[str] = None) -> LayerBResult:
        """
        Run Layer B and return the strict structured result.

        Tries the primary provider (with retries), then each fallback in order.
        Raises AIProviderError only if every provider is exhausted.
        """
        prompt = get_layer_b_prompt(self.prompt_version)
        chain = [self.provider, *self.fallbacks]

        errors: List[str] = []
        for idx, prov in enumerate(chain):
            is_fallback = idx > 0
            try:
                response = self._call_with_retries(prov, image_path, prompt)
            except AIProviderError as exc:
                logger.warning("Provider '%s' failed: %s", prov.provider_name, exc)
                errors.append(f"{prov.provider_name}: {exc}")
                continue

            try:
                result = self._parse_and_validate(response)
            except (AIProviderError, ValidationError) as exc:
                logger.warning(
                    "Provider '%s' returned unusable output: %s", prov.provider_name, exc
                )
                errors.append(f"{prov.provider_name}: {exc}")
                continue

            # Stamp provenance on success.
            result.provider_used = response.provider_name
            result.model_used = response.model_used
            result.prompt_version = self.prompt_version
            result.source_media_id = source_media_id
            result.fallback_used = is_fallback
            if is_fallback:
                logger.info(
                    "Layer B fallback succeeded via '%s' after primary failure.",
                    prov.provider_name,
                )
            return result

        raise AIProviderError(
            "All Layer B providers failed. Attempts: " + " | ".join(errors)
        )

    def detect_evidence(
        self, image_path: str, source_media_id: Optional[str] = None
    ) -> List[AIEvidence]:
        """AIEvidence-compatible output for storage / downstream layers."""
        result = self.detect(image_path, source_media_id=source_media_id)
        return result.to_ai_evidence()

    # ── Internals ───────────────────────────────────────────────────────────────

    def _call_with_retries(
        self, provider: VisionEvidenceProvider, image_path: str, prompt: str
    ) -> VisionResponse:
        last_exc: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return provider.analyze_image(image_path, prompt)
            except AIProviderError as exc:
                last_exc = exc
                logger.info(
                    "Provider '%s' attempt %d/%d failed: %s",
                    provider.provider_name,
                    attempt,
                    self.max_retries,
                    exc,
                )
                if attempt < self.max_retries:
                    # Small linear backoff; kept tiny so tests stay fast.
                    time.sleep(0.05 * attempt)
        raise AIProviderError(
            f"Provider '{provider.provider_name}' exhausted {self.max_retries} attempt(s): {last_exc}"
        )

    def _parse_and_validate(self, response: VisionResponse) -> LayerBResult:
        payload = _extract_json(response.text)

        # Only keep the fields the model is meant to supply; provenance is added
        # by the detector, never trusted from the model.
        filtered = {k: payload[k] for k in LAYER_B_MODEL_FIELDS if k in payload}

        missing = [k for k in LAYER_B_MODEL_FIELDS if k not in filtered]
        if missing:
            raise AIProviderError(
                f"Model output missing required indicators: {', '.join(missing)}"
            )

        # LayerBResult forbids extra fields and enforces enums/ranges → strict.
        return LayerBResult(**filtered)
