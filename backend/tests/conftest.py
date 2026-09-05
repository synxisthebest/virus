"""Pytest test configuration and fixtures."""

import sys
import os
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Ensure backend/ directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import create_application


@pytest.fixture(scope="session")
def app_instance():
    """Provides FastAPI test application instance."""
    return create_application()


@pytest.fixture(scope="session")
def client(app_instance):
    """Provides synchronous FastAPI TestClient."""
    with TestClient(app_instance) as test_client:
        yield test_client
