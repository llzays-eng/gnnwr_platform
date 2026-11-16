"""P0-1: /models/train must reject datasets that don't belong to the requested project."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.v1 import models as models_api
from app.core.database import get_db
from app.core.deps import get_current_user
from app.main import app
from app.models.project import Dataset, Project


class FakeDB:
    def __init__(self, objects: dict):
        self.objects = objects
        self.added = []

    def get(self, model, key):
        return self.objects.get((model, key))

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        pass

    def refresh(self, _obj):
        pass

    def delete(self, _obj):
        pass

    def close(self):
        pass


ATTACKER = SimpleNamespace(id="user-attacker")
ATTACKER_PROJ = SimpleNamespace(id="proj-attacker", user_id="user-attacker")
VICTIM_PROJ = SimpleNamespace(id="proj-victim", user_id="user-victim")
VICTIM_DS = SimpleNamespace(id="ds-victim", project_id="proj-victim")
OTHER_OWN_PROJ = SimpleNamespace(id="proj-attacker-2", user_id="user-attacker")
OWN_DS_OTHER_PROJ = SimpleNamespace(id="ds-own-2", project_id="proj-attacker-2")


def _body(dataset_id: str) -> dict:
    return {
        "project_id": "proj-attacker",
        "dataset_id": dataset_id,
        "model_type": "GNNWR",
        "y_column": "y",
        "x_columns": ["x1"],
        "spatial_columns": ["lon", "lat"],
    }


@pytest.fixture
def client(monkeypatch):
    db = FakeDB({
        (Project, "proj-attacker"): ATTACKER_PROJ,
        (Project, "proj-victim"): VICTIM_PROJ,
        (Project, "proj-attacker-2"): OTHER_OWN_PROJ,
        (Dataset, "ds-victim"): VICTIM_DS,
        (Dataset, "ds-own-2"): OWN_DS_OTHER_PROJ,
    })
    # Pretend cleaned.csv exists so only the ownership check can stop the request.
    monkeypatch.setattr(models_api.storage, "exists", lambda _key: True)

    def must_not_enqueue(*_a, **_k):
        raise AssertionError("training must not be enqueued for a foreign dataset")

    monkeypatch.setattr(models_api, "enqueue", must_not_enqueue)

    def override_db():
        yield db

    app.dependency_overrides[get_current_user] = lambda: ATTACKER
    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app), db
    finally:
        app.dependency_overrides.clear()


def test_train_rejects_other_users_dataset(client):
    c, db = client
    r = c.post("/api/v1/models/train", json=_body("ds-victim"))
    assert r.status_code == 404
    assert db.added == []


def test_train_rejects_dataset_from_another_own_project(client):
    c, db = client
    r = c.post("/api/v1/models/train", json=_body("ds-own-2"))
    assert r.status_code == 404
    assert db.added == []


def test_train_missing_dataset_404(client):
    c, db = client
    r = c.post("/api/v1/models/train", json=_body("ds-missing"))
    assert r.status_code == 404
    assert db.added == []
