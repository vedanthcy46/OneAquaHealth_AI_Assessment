from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class ImageQualityResult(BaseModel):
    score: int
    factors: List[Dict[str, Any]]
    approved: bool

class AIEvidence(BaseModel):
    indicator: str
    present: bool
    confidence: float
    reasoning: str
    image_region: Optional[Dict[str, float]] = None

class FollowUpQuestion(BaseModel):
    id: str
    question: str
    type: str = "single_choice"
    options: List[str]
    evidence_basis: List[str]
    priority: int
    required: bool = False

    @property
    def key(self) -> str:
        return self.id

    @property
    def question_text(self) -> str:
        return self.question

class ValidationWarning(BaseModel):
    type: str
    severity: str
    explanation: Dict[str, str]

class ConfidenceResult(BaseModel):
    score: int
    routing_decision: str
    factors: Dict[str, int]
