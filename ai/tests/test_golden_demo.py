import json

from scripts.aquaguard_golden_demo import run_demo


def test_golden_demo_is_deterministic_and_reproduces_scenario():
    first = run_demo()
    second = run_demo()

    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    # Spec Step 37: an algal-bloom detection that diverges from the site baseline
    # must NOT auto-accept — it enters the review queue.
    assert first["status"] == "REVIEW_REQUIRED"
    assert first["routing_decision"] == "REVIEW_REQUIRED"
    assert first["anomaly_detected"] is True
    assert first["layer_b"]["turbidity"]["value"] == "murky"
    assert first["layer_b"]["algal_bloom"]["value"] == "present"
    assert first["layer_b"]["debris"]["value"] == "absent"
    assert [question["id"] for question in first["layer_c"]["questions"][:3]] == [
        "algae_smell", "algae_duration", "algae_dead_animals"
    ]
    assert first["layer_c"]["answers"]["algae_dead_animals"] == "yes"
    assert first["layer_d"]["historical_comparison"]["water_clarity"] == "diverges from baseline (clear)"
    assert first["layer_d"]["conflicts"] == []
    assert first["confidence"]["weights"] == {
        "imageQuality": 0.25,
        "aiEvidenceAgreement": 0.30,
        "citizenConsistency": 0.25,
        "gpsValidity": 0.10,
        "historicalConsistency": 0.10,
    }
