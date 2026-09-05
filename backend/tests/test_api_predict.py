"""Integration tests for POST /api/v1/predict/wells-riley."""

from fastapi.testclient import TestClient


class TestPredictWellsRileyEndpoint:
    """Test suite for Wells-Riley prediction API endpoint."""

    def test_predict_successful_cadr_input(self, client: TestClient):
        """Test prediction request with clean_air_delivery_rate."""
        payload = {
            "infected_count": 1,
            "susceptible_count": 30,
            "breathing_rate": 0.5,
            "quanta_generation_rate": 50.0,
            "exposure_time_hours": 3.0,
            "ventilation": {
                "clean_air_delivery_rate": 300.0
            },
            "distance_factor": 1.0,
            "mask_config": {
                "mask_type_f0": "none",
                "mask_type_susceptible": "none"
            },
            "ventilation_distribution_factor": 1.0
        }

        response = client.post("/api/v1/predict/wells-riley", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert "infection_probability" in data
        assert "infection_probability_percent" in data
        assert "risk_level" in data
        assert "expected_new_cases" in data
        assert "effective_reproductive_number" in data
        assert "recommendations" in data
        assert "mitigation_options" in data
        assert len(data["recommendations"]) > 0
        assert len(data["mitigation_options"]) > 0

        # Verify logical value ranges
        assert 0.0 <= data["infection_probability"] <= 1.0
        assert 0.0 <= data["infection_probability_percent"] <= 100.0
        assert data["expected_new_cases"] >= 0.0

    def test_predict_successful_ach_volume_input(self, client: TestClient):
        """Test prediction request with room_volume_m3 and air_changes_per_hour."""
        payload = {
            "infected_count": 1,
            "susceptible_count": 25,
            "activity_level": "speaking",
            "quanta_preset": "speaking_loud",
            "exposure_time_hours": 2.0,
            "ventilation": {
                "room_volume_m3": 150.0,
                "air_changes_per_hour": 3.0
            },
            "mask_config": {
                "mask_type_f0": "surgical",
                "mask_type_susceptible": "surgical"
            },
            "ventilation_type": "well_mixed"
        }

        response = client.post("/api/v1/predict/wells-riley", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["parameters_used"]["clean_air_flow_Q_m3h"] == 450.0
        assert data["parameters_used"]["breathing_rate_p_m3h"] == 0.75
        assert data["parameters_used"]["quanta_rate_q_per_h"] == 100.0
        # Surgical mask km = 0.15
        assert data["parameters_used"]["mask_factor_km"] == 0.15

    def test_predict_validation_error_missing_ventilation(self, client: TestClient):
        """Test validation error when neither CADR nor Volume+ACH is provided."""
        payload = {
            "infected_count": 1,
            "exposure_time_hours": 2.0,
            "ventilation": {}
        }

        response = client.post("/api/v1/predict/wells-riley", json=payload)
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"] == "Validation Error"

    def test_predict_validation_error_negative_values(self, client: TestClient):
        """Test validation error on invalid negative inputs."""
        payload = {
            "infected_count": 0,  # Min 1
            "exposure_time_hours": -2.0,  # > 0
            "ventilation": {
                "clean_air_delivery_rate": 300.0
            }
        }

        response = client.post("/api/v1/predict/wells-riley", json=payload)
        assert response.status_code == 422

    def test_n95_mask_dramatic_risk_reduction(self, client: TestClient):
        """Test that wearing N95 masks drastically suppresses infection risk."""
        base_payload = {
            "infected_count": 1,
            "susceptible_count": 30,
            "breathing_rate": 0.5,
            "quanta_generation_rate": 50.0,
            "exposure_time_hours": 4.0,
            "ventilation": {"clean_air_delivery_rate": 200.0},
        }

        # Case A: No mask
        payload_no_mask = {
            **base_payload,
            "mask_config": {"mask_type_f0": "none", "mask_type_susceptible": "none"}
        }
        res_no_mask = client.post("/api/v1/predict/wells-riley", json=payload_no_mask).json()

        # Case B: N95 masks
        payload_n95 = {
            **base_payload,
            "mask_config": {"mask_type_f0": "n95", "mask_type_susceptible": "n95"}
        }
        res_n95 = client.post("/api/v1/predict/wells-riley", json=payload_n95).json()

        assert res_no_mask["infection_probability"] > res_n95["infection_probability"]
        assert res_n95["infection_probability"] < 0.05
        assert res_n95["risk_level"] == "LOW"
