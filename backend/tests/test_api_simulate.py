"""Integration tests for simulation endpoints (Time-Series & Spatial Classroom)."""

from fastapi.testclient import TestClient


class TestSimulationEndpoints:
    """Test suite for simulation API routes."""

    def test_time_series_simulation_success(self, client: TestClient):
        """Test time-series simulation generates expected chart trajectories."""
        payload = {
            "infected_count": 1,
            "susceptible_count": 30,
            "breathing_rate": 0.5,
            "quanta_generation_rate": 40.0,
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

        response = client.post("/api/v1/simulate/time-series", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert "time_series" in data
        assert "chart_dataset" in data
        assert "simulation_summary" in data

        # Check time series progression: probabilities should be monotonically increasing with time t
        ts = data["time_series"]
        assert len(ts) >= 6
        for i in range(1, len(ts)):
            assert ts[i]["time_hours"] >= ts[i - 1]["time_hours"]
            assert ts[i]["infection_probability"] >= ts[i - 1]["infection_probability"]

        # Check chart dataset formatting
        chart = data["chart_dataset"]
        assert len(chart["labels"]) == len(ts)
        assert len(chart["probabilities"]) == len(ts)
        assert len(chart["risk_colors"]) == len(ts)

    def test_spatial_classroom_simulation_success(self, client: TestClient):
        """Test classroom grid multi-seat simulation."""
        seats = [
            {"row": 0, "col": 0, "state": "sick"},
            {"row": 0, "col": 1, "state": "healthy"},  # Distance 1m (<2m)
            {"row": 0, "col": 4, "state": "healthy"},  # Distance 4m (>=2m)
            {"row": 2, "col": 2, "state": "empty-s"},
        ]

        payload = {
            "rows": 3,
            "cols": 5,
            "grid_spacing_meters": 1.0,
            "breathing_rate": 0.5,
            "quanta_rate": 30.0,
            "exposure_time_hours": 4.0,
            "clean_air_flow_Q": 300.0,
            "mask_factor_km": 1.0,
            "ventilation_distribution_kh": 1.0,
            "seats": seats
        }

        response = client.post("/api/v1/simulate/spatial-classroom", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert data["total_seats"] == 4
        assert data["sick_count"] == 1
        assert data["healthy_count"] == 2
        assert data["empty_count"] == 1

        results = data["seats_risk_map"]
        # Seat close to F0 (row 0, col 1) should have higher probability than far seat (row 0, col 4)
        close_seat = next(s for s in results if s["row"] == 0 and s["col"] == 1)
        far_seat = next(s for s in results if s["row"] == 0 and s["col"] == 4)
        empty_seat = next(s for s in results if s["row"] == 2 and s["col"] == 2)

        assert close_seat["infection_probability"] > far_seat["infection_probability"]
        assert empty_seat["infection_probability"] == 0.0
