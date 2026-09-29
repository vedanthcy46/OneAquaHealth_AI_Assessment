from typing import List
from ai.schemas.base import AIEvidence, FollowUpQuestion

class AdaptiveQuestionGenerator:
    def __init__(self):
        pass

    def generate_questions(self, evidence: List[AIEvidence]) -> List[FollowUpQuestion]:
        """
        Generate contextual follow-up questions based on the detected evidence.
        """
        raise NotImplementedError("Question generation logic goes here")
