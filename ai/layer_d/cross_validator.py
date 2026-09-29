from typing import List, Dict, Any, Optional
from ai.schemas.base import AIEvidence
from ai.schemas.layer_d import ConsistencyResult, ConsistencyStatus

class CrossValidator:
    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    def validate_consistency(
        self, 
        evidence: List[AIEvidence], 
        citizen_answers: Dict[str, Any],
        historical_baseline: Optional[Dict[str, Any]] = None
    ) -> ConsistencyResult:
        """
        Validate consistency between AI evidence, citizen answers, and historical data.
        """
        conflicts = []
        supporting_evidence = []
        major_conflict = False
        minor_conflict = False
        
        # Determine conflicts and support deterministically
        for ev in evidence:
            indicator = ev.indicator.lower()
            present = ev.present
            reasoning = ev.reasoning.lower()
            
            if indicator == "turbidity" and "water_clarity" in citizen_answers:
                c_val = str(citizen_answers["water_clarity"]).lower()
                if "clear" in c_val and "opaque" in reasoning:
                    major_conflict = True
                    conflicts.append("Citizen says clear but AI says opaque")
                elif "clear" in c_val and not present:
                    supporting_evidence.append("Both indicate clear water")
                    
            if indicator == "water_flow" and "water_flow" in citizen_answers:
                c_val = str(citizen_answers["water_flow"]).lower()
                if "dry" in c_val and ("flowing" in reasoning or present):
                    major_conflict = True
                    conflicts.append("Citizen says dry but image evidence indicates flowing water")
                    
            if indicator == "debris" and "debris" in citizen_answers:
                c_val = str(citizen_answers["debris"]).lower()
                if c_val in ["none", "no debris", "false", "no"]:
                    if present and "substantial" in reasoning:
                        major_conflict = True
                        conflicts.append("Citizen denies visible debris when substantial debris is detected")
                    elif present:
                        minor_conflict = True
                        conflicts.append("Citizen says no debris but some is detected")
                elif "little" in c_val or "some" in c_val:
                    if "moderate" in reasoning:
                        minor_conflict = True
                        conflicts.append("Minor disagreement on debris amount (citizen: a little, AI: moderate)")
                    elif "substantial" in reasoning:
                        major_conflict = True
                        conflicts.append("Citizen says a little debris but substantial debris is detected")
                        
            if indicator == "algal_bloom" and "smell" in citizen_answers:
                c_val = str(citizen_answers["smell"]).lower()
                if "strong" in c_val and present:
                    supporting_evidence.append("Citizen reported strong smell, AI detected algal bloom (potentially consistent, do not claim causality).")
        
        # Missing citizen answers?
        if not citizen_answers and evidence:
            # Can't compare much
            pass

        # Handle historical baseline
        hist_comparison = "unavailable"
        if historical_baseline:
            hist_comparison = {}
            for k, v in historical_baseline.items():
                if k in citizen_answers:
                    if str(citizen_answers[k]).lower() != str(v).lower():
                        hist_comparison[k] = f"diverges from baseline ({v})"
                    else:
                        hist_comparison[k] = "matches baseline"

        # Arbitration logic (LLM could be used here if needed, but deterministic rules override)
        # We check the highest severity
        if major_conflict:
            status = ConsistencyStatus.MAJOR_CONFLICT
            score = 30
            requires_review = True
        elif minor_conflict:
            status = ConsistencyStatus.MINOR_CONFLICT
            score = 70
            requires_review = False
        else:
            status = ConsistencyStatus.CONSISTENT
            score = 100
            requires_review = False
            
        explanation = f"Cross-validation completed with status {status.value}."
        if conflicts:
            explanation += " Discrepancies found."
        elif supporting_evidence:
            explanation += " Evidence is consistent."

        return ConsistencyResult(
            status=status,
            score=score,
            conflicts=conflicts,
            supporting_evidence=supporting_evidence,
            historical_comparison=hist_comparison,
            explanation=explanation,
            requires_review=requires_review
        )

