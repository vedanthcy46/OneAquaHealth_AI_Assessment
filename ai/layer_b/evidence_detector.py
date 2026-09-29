from typing import List
from ai.schemas.base import AIEvidence
from ai.providers.base import BaseAIProvider

class EcologicalEvidenceDetector:
    def __init__(self, provider: BaseAIProvider):
        self.provider = provider

    async def detect_evidence(self, image_path: str) -> List[AIEvidence]:
        """
        Detect ecological evidence from the image using the AI provider.
        """
        raise NotImplementedError("Evidence detection logic goes here")
