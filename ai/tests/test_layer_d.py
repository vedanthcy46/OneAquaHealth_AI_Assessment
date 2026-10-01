import pytest
from ai.layer_d.cross_validator import CrossValidator
from ai.schemas.base import AIEvidence
from ai.schemas.layer_d import ConsistencyStatus

def test_fully_consistent():
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="turbidity", present=False, confidence=0.9, reasoning="clear water"),
        AIEvidence(indicator="algal_bloom", present=True, confidence=0.8, reasoning="algae visible")
    ]
    citizen_answers = {
        "water_clarity": "clear",
        "smell": "strong smell"
    }
    baseline = {"water_clarity": "clear"}
    
    result = validator.validate_consistency(evidence, citizen_answers, baseline)
    
    assert result.status == ConsistencyStatus.CONSISTENT
    assert result.score == 100
    assert not result.requires_review
    assert len(result.supporting_evidence) == 2
    assert result.historical_comparison["water_clarity"] == "matches baseline"

def test_minor_disagreement():
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="debris", present=True, confidence=0.8, reasoning="moderate debris observed")
    ]
    citizen_answers = {
        "debris": "a little"
    }
    baseline = {"debris": "none"}
    
    result = validator.validate_consistency(evidence, citizen_answers, baseline)
    
    assert result.status == ConsistencyStatus.MINOR_CONFLICT
    assert result.score == 70
    assert not result.requires_review
    assert len(result.conflicts) == 1
    assert "Minor disagreement" in result.conflicts[0]

def test_major_contradiction():
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="water_flow", present=True, confidence=0.9, reasoning="flowing water")
    ]
    citizen_answers = {
        "water_flow": "dry"
    }
    
    result = validator.validate_consistency(evidence, citizen_answers, None)
    
    assert result.status == ConsistencyStatus.MAJOR_CONFLICT
    assert result.score == 30
    assert result.requires_review
    assert len(result.conflicts) == 1
    assert "Citizen says dry" in result.conflicts[0]

def test_missing_baseline():
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="turbidity", present=False, confidence=0.9, reasoning="clear water")
    ]
    citizen_answers = {
        "water_clarity": "clear"
    }
    
    result = validator.validate_consistency(evidence, citizen_answers, None)
    
    assert result.status == ConsistencyStatus.CONSISTENT
    assert result.historical_comparison == "unavailable"

def test_missing_citizen_answers():
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="turbidity", present=False, confidence=0.9, reasoning="clear water")
    ]
    
    result = validator.validate_consistency(evidence, {}, {"water_clarity": "clear"})
    
    assert result.status == ConsistencyStatus.CONSISTENT
    assert len(result.conflicts) == 0
    assert len(result.supporting_evidence) == 0
    # historical comparison will be empty since no citizen answers overlap
    assert result.historical_comparison == {}

def test_uncertain_ai_evidence():
    # If AI has low confidence or unclear reasoning that doesn't trigger major rules
    validator = CrossValidator()
    evidence = [
        AIEvidence(indicator="debris", present=False, confidence=0.4, reasoning="unclear, maybe no debris")
    ]
    citizen_answers = {
        "debris": "none"
    }
    
    result = validator.validate_consistency(evidence, citizen_answers, None)
    
    # Since it's 'none' and 'present=False', it won't trigger conflict. 
    # Our deterministic rule looks for present=True to trigger conflicts.
    assert result.status == ConsistencyStatus.CONSISTENT
    assert len(result.conflicts) == 0

if __name__ == "__main__":
    pytest.main(["-v", __file__])
