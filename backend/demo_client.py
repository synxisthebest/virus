"""Demonstration client demonstrating calls to all Wells-Riley API endpoints."""

import sys
import json

# Ensure UTF-8 output on Windows console
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def print_section(title: str):
    print("\n" + "=" * 70)
    print(f"[TEST] {title}")
    print("=" * 70)


def demo():
    # 1. Health Check
    print_section("1. GET /api/v1/health (Health Check)")
    res = client.get("/api/v1/health")
    print(f"Status Code: {res.status_code}")
    print(json.dumps(res.json(), indent=2, ensure_ascii=False))

    # 2. Get Presets
    print_section("2. GET /api/v1/constants/presets (Epidemiological Lookup Presets)")
    res = client.get("/api/v1/constants/presets")
    print(f"Status Code: {res.status_code}")
    presets = res.json()
    print(f"Available Mask Types ({len(presets['mask_types'])}): {[m['id'] for m in presets['mask_types']]}")
    print(f"Available Activity Levels ({len(presets['activity_levels'])}): {[a['id'] for a in presets['activity_levels']]}")

    # 3. Instant Risk Assessment
    print_section("3. POST /api/v1/predict/wells-riley (Instant Risk Assessment)")
    predict_payload = {
        "infected_count": 1,
        "susceptible_count": 35,
        "breathing_rate": 0.5,
        "quanta_generation_rate": 50.0,
        "exposure_time_hours": 4.0,
        "ventilation": {
            "room_volume_m3": 180.0,
            "air_changes_per_hour": 2.0
        },
        "distance_factor": 1.0,
        "mask_config": {
            "mask_type_f0": "cloth",
            "mask_type_susceptible": "cloth"
        },
        "ventilation_distribution_factor": 1.0
    }
    res = client.post("/api/v1/predict/wells-riley", json=predict_payload)
    print(f"Status Code: {res.status_code}")
    pred_data = res.json()
    print(f"Infection Probability: {pred_data['infection_probability_percent']}%")
    print(f"Risk Tier: {pred_data['risk_level']} ({pred_data['risk_level_label_vi']})")
    print(f"Expected New Cases: {pred_data['expected_new_cases']} cases")
    print(f"Indoor Rt: {pred_data['effective_reproductive_number']}")
    print("\nRecommendations:")
    for rec in pred_data["recommendations"]:
        print(f" - {rec}")
    print("\nMitigation What-If Comparison:")
    for opt in pred_data["mitigation_options"]:
        print(f" * [{opt['intervention_name']}]: Risk drops to {opt['new_probability_percent']}% (Reduction: {opt['risk_reduction_percent']}%)")

    # 4. Time-Series Simulation
    print_section("4. POST /api/v1/simulate/time-series (Time-Series Simulation for Charts)")
    ts_payload = {
        "infected_count": 1,
        "susceptible_count": 30,
        "exposure_time_hours": 6.0,
        "start_time_hours": 0.5,
        "max_time_hours": 6.0,
        "time_step_hours": 1.0,
        "ventilation": {
            "clean_air_delivery_rate": 250.0
        },
        "mask_config": {
            "mask_type_f0": "none",
            "mask_type_susceptible": "none"
        }
    }
    res = client.post("/api/v1/simulate/time-series", json=ts_payload)
    print(f"Status Code: {res.status_code}")
    ts_data = res.json()
    print(f"Total Trajectory Points: {ts_data['data_points_count']}")
    for pt in ts_data["time_series"][:5]:
        print(f" - t = {pt['time_hours']}h ({pt['time_minutes']}m): P = {pt['infection_probability_percent']}% | Cases = {pt['expected_new_cases']} | Level = {pt['risk_level']}")


if __name__ == "__main__":
    demo()
