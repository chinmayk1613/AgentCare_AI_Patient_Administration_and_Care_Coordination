import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./data/test-agentcare.db"
os.environ["JWT_SECRET"] = "test-secret-not-for-production"
os.environ["LLM_ENABLED"] = "false"

db_path = Path("./data/test-agentcare.db")
if db_path.exists():
    db_path.unlink()

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed import seed


@pytest.fixture(scope="session")
def client():
    seed()
    with TestClient(app) as test_client:
        yield test_client


def login(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def patient_headers(client):
    return login(client, "chinmay.kashikar@agentcare.demo", "Patient123!")


@pytest.fixture
def reviewer_headers(client):
    return login(client, "vikas.jha@agentcare.demo", "Reviewer123!")
