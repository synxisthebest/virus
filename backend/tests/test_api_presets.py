"""Integration tests for Presets and Health check endpoints."""

from fastapi.testclient import TestClient


def test_health_check_endpoint(client: TestClient):
    """Test health check returns status healthy."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


def test_get_presets_endpoint(client: TestClient):
    """Test lookup tables presets endpoint."""
    response = client.get("/api/v1/constants/presets")
    assert response.status_code == 200
    data = response.json()

    assert "mask_types" in data
    assert "activity_levels" in data
    assert "quanta_presets" in data
    assert "ventilation_types" in data
    assert "risk_thresholds" in data

    # Check mask types include standard variants
    mask_ids = [m["id"] for m in data["mask_types"]]
    assert "none" in mask_ids
    assert "cloth" in mask_ids
    assert "surgical" in mask_ids
    assert "n95" in mask_ids

    # Check activity levels
    activity_ids = [a["id"] for a in data["activity_levels"]]
    assert "resting" in activity_ids
    assert "speaking" in activity_ids


def test_root_endpoint(client: TestClient):
    """Test root landing endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "documentation" in data
    assert data["documentation"] == "/docs"
