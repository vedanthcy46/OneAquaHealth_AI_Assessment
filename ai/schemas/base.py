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
    key: str
    question_text: str
    options: List[str]

class ValidationWarning(BaseModel):
    type: str
    severity: str
    explanation: Dict[str, str]

class ConfidenceResult(BaseModel):
    score: int
    routing_decision: str
    factors: Dict[str, int]
