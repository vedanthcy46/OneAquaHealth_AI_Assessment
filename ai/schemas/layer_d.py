from pydantic import BaseModel, Field
from typing import List, Dict, Any, Union, Optional
from enum import Enum

class ConsistencyStatus(str, Enum):
    CONSISTENT = "CONSISTENT"
    MINOR_CONFLICT = "MINOR_CONFLICT"
    MAJOR_CONFLICT = "MAJOR_CONFLICT"

class ConsistencyResult(BaseModel):
    status: ConsistencyStatus
    score: int = Field(..., ge=0, le=100)
    conflicts: List[str] = Field(default_factory=list)
    supporting_evidence: List[str] = Field(default_factory=list)
    historical_comparison: Any  # dict or "unavailable"
    explanation: str
    requires_review: bool
