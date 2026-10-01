"""
Provider abstraction for AI vision/text backends.

Two layers of abstraction live here:

  BaseAIProvider
      The original minimal interface (kept for backward compatibility with
      the orchestrator and any Phase-1 callers).

  VisionEvidenceProvider
      The interface Layer B relies on. It is deliberately narrow: given an
      image path and a prompt, return the model's RAW text response together
      with provenance (provider name + concrete model id). Parsing, schema
      validation, retries across providers and fallback are handled OUTSIDE
      the provider (in the detector), so each provider stays simple and
      independently testable.

Keeping providers behind this interface guarantees the application is never
dependent on a single vendor: OpenAI and Gemini are interchangeable, and new
providers can be added without touching Layer B logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


class BaseAIProvider(ABC):
    @abstractmethod
    async def analyze_image(self, image_path: str, prompt: str) -> str:
        """Analyze an image using a vision model."""
        pass

    @abstractmethod
    async def generate_text(self, prompt: str) -> str:
        """Generate text from a prompt."""
        pass


@dataclass
class VisionResponse:
    """Raw response from a vision provider plus provenance."""
    text: str
    provider_name: str
    model_used: str


class VisionEvidenceProvider(ABC):
    """
    Narrow interface used by Layer B.

    Implementations MUST:
      - enforce their own per-call timeout,
      - raise AIProviderError on any failure (network, timeout, empty output),
      - return the raw model text (NOT parsed) inside a VisionResponse.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Stable provider identifier, e.g. 'openai' or 'gemini'."""
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Concrete model identifier this provider is configured to call."""
        ...

    @abstractmethod
    def analyze_image(self, image_path: str, prompt: str) -> VisionResponse:
        """
        Send the image + prompt to the vision model and return raw text.

        Raises:
            ai.utils.exceptions.AIProviderError: on any failure.
        """
        ...
