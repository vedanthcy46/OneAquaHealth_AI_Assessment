EVIDENCE_DETECTION_V1 = """
You are an ecological field assessment assistant. 
Analyse the attached stream photograph scientifically.

For each indicator below, state:
- present: true/false/uncertain
- confidence: 0.0–1.0
- reasoning: one sentence
- image_region: approximate {x,y,w,h} as fractions 0–1, or null
"""

CONFLICT_EXPLANATION_V1 = """
A citizen observation has a potential inconsistency.
Citizen answered: "{citizen_answer}"
AI detected: "{ai_detection}" with {confidence}% confidence.

Generate a brief, non-alarmist explanation with:
- WHAT: what was detected
- WHY: why this might be an inconsistency  
- NEXT_ACTION: a simple, helpful action for the citizen
"""
