"""
Google Gemini vision provider for Layer B.

Fallback provider in the OpenAI → Gemini chain. Interchangeable with the
OpenAI provider via the shared VisionEvidenceProvider interface.

Design notes:
  - The `google.generativeai` SDK is imported lazily so the module loads in
    offline/test environments and a missing dependency surfaces only on a
    real call.
  - Gemini's Python SDK does not accept an arbitrary per-request timeout the
    same way; we pass a request_options timeout where supported and otherwise
    rely on the SDK default. Failures are normalised to AIProviderError.
  - `response_mime_type="application/json"` requests strict JSON; the detector
    still validates the payload.
"""

from __future__ import annotations

import os
from pathlib import Path

from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.utils.exceptions import AIProviderError
from ai.utils.logger import get_logger

logger = get_logger(__name__)

_DEFAULT_MODEL = "gemini-1.5-pro"
_DEFAULT_TIMEOUT_S = 30.0


def _guess_mime(image_path: str) -> str:
    ext = Path(image_path).suffix.lower()
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/jpeg")


class GeminiVisionProvider(VisionEvidenceProvider):
    def __init__(
        self,
        api_key: str | None = None,
        model: str = _DEFAULT_MODEL,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ):
        self._api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._model = model
        self._timeout_s = timeout_s

    @property
    def provider_name(self) -> str:
        return "gemini"

    @property
    def model_name(self) -> str:
        return self._model

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        if not self._api_key:
            raise AIProviderError("Gemini API key is not configured (GEMINI_API_KEY).")

        try:
            import google.generativeai as genai  # lazy import
        except ImportError as exc:  # pragma: no cover - depends on env
            raise AIProviderError(f"google-generativeai SDK is not installed: {exc}") from exc

        try:
            image_bytes = Path(image_path).read_bytes()
        except OSError as exc:
            raise AIProviderError(f"Could not read image '{image_path}': {exc}") from exc

        mime = _guess_mime(image_path)

        try:
            genai.configure(api_key=self._api_key)
            model = genai.GenerativeModel(
                self._model,
                generation_config={"response_mime_type": "application/json"},
            )
            response = model.generate_content(
                [prompt, {"mime_type": mime, "data": image_bytes}],
                request_options={"timeout": self._timeout_s},
            )
        except Exception as exc:  # network/timeout/API errors → normalise
            raise AIProviderError(f"Gemini vision call failed: {exc}") from exc

        text = getattr(response, "text", None)
        if not text or not text.strip():
            raise AIProviderError("Gemini returned an empty response.")

        logger.info("Gemini vision call succeeded (model=%s)", self._model)
        return VisionResponse(text=text, provider_name=self.provider_name, model_used=self._model)
