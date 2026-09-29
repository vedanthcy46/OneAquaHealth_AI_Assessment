"""
OpenAI vision provider for Layer B.

Primary provider in the OpenAI → Gemini fallback chain.

Design notes:
  - The `openai` SDK is imported lazily inside the call so that:
      * the module imports cleanly in offline/test environments, and
      * a missing dependency surfaces as a clear AIProviderError only when a
        real call is attempted.
  - The image is base64-encoded and sent as a data URL (the format the
    Chat Completions vision API expects).
  - `response_format={"type": "json_object"}` nudges the model toward strict
    JSON output; the detector still validates and never trusts it blindly.
  - Any failure (missing key, network, timeout, empty output) is normalised to
    AIProviderError so the detector can trigger the fallback uniformly.
"""

from __future__ import annotations

import base64
import os
from pathlib import Path

from ai.providers.base import VisionEvidenceProvider, VisionResponse
from ai.safety.pii import redact
from ai.utils.exceptions import AIProviderError
from ai.utils.logger import get_logger

logger = get_logger(__name__)

_DEFAULT_MODEL = "gpt-4o"
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


def _encode_image(image_path: str) -> str:
    try:
        with open(image_path, "rb") as fh:
            return base64.b64encode(fh.read()).decode("ascii")
    except OSError as exc:
        raise AIProviderError(f"Could not read image '{image_path}': {exc}") from exc


class OpenAIVisionProvider(VisionEvidenceProvider):
    def __init__(
        self,
        api_key: str | None = None,
        model: str = _DEFAULT_MODEL,
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ):
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._model = model
        self._timeout_s = timeout_s

    @property
    def provider_name(self) -> str:
        return "openai"

    @property
    def model_name(self) -> str:
        return self._model

    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        if not self._api_key:
            raise AIProviderError("OpenAI API key is not configured (OPENAI_API_KEY).")

        try:
            from openai import OpenAI  # lazy import
        except ImportError as exc:  # pragma: no cover - depends on env
            raise AIProviderError(f"openai SDK is not installed: {exc}") from exc

        b64 = _encode_image(image_path)
        mime = _guess_mime(image_path)

        # Defence-in-depth: never send PII to the provider. The Layer B prompt
        # is fixed and PII-free, but we scrub unconditionally in case a caller
        # ever passes citizen-derived text through.
        safe_prompt = redact(prompt).text

        try:
            client = OpenAI(api_key=self._api_key, timeout=self._timeout_s)
            completion = client.chat.completions.create(
                model=self._model,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": safe_prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime};base64,{b64}"},
                            },
                        ],
                    }
                ],
            )
        except Exception as exc:  # network/timeout/API errors → normalise
            raise AIProviderError(f"OpenAI vision call failed: {exc}") from exc

        try:
            text = completion.choices[0].message.content
        except (AttributeError, IndexError, KeyError) as exc:
            raise AIProviderError(f"OpenAI returned an unexpected response shape: {exc}") from exc

        if not text or not text.strip():
            raise AIProviderError("OpenAI returned an empty response.")

        logger.info("OpenAI vision call succeeded (model=%s)", self._model)
        return VisionResponse(text=text, provider_name=self.provider_name, model_used=self._model)
