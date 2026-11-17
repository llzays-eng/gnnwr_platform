"""P1-1 ~ P1-3：普通登录用户可触发的资源耗尽——尺寸/数量/时长上限的回归测试。"""
from __future__ import annotations

import io
import json
from types import SimpleNamespace

import numpy as np
import pytest
from celery.exceptions import SoftTimeLimitExceeded
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError

from app.api.v1 import datasets as datasets_api
from app.api.v1 import models as models_api
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.main import app
from app.models.model_task import ModelTask
from app.models.project import Dataset, Project
from app.schemas.model import ModelHyperparams, TrainRequest
from app.services import crs_transform, surface
from app.services.signed_url import create_tile_token
from app.services.storage import storage
from app.tasks import training
from app.tasks.celery_app import celery_app

USER = SimpleNamespace(id="user-1")
PROJ = SimpleNamespace(id="proj-1", user_id="user-1")
TASK = SimpleNamespace(id="task-1", project_id="proj-1")


class FakeDB:
    def __init__(self, objects: dict | None = None, active_tasks: int = 0):
        self.objects = dict(objects or {})
        self.added: list = []
        self.active_tasks = active_tasks

    def get(self, model, key):
        return self.objects.get((model, key))

    def scalar(self, *_a, **_k):
        return self.active_tasks

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        pass

    def rollback(self):
        pass

    def refresh(self, _obj):
        pass

    def delete(self, _obj):
        pass

    def execute(self, *_a, **_k):
        raise AssertionError("query must be rejected before touching the DB")

    def close(self):
        pass


@pytest.fixture
def api(monkeypatch):
    db = FakeDB({(Project, "proj-1"): PROJ, (ModelTask, "task-1"): TASK})

    def override_db():
        yield db

    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_db] = override_db
    try:
        yield TestClient(app), db
    finally:
        app.dependency_overrides.clear()


# ---------------------------------------------------------------- P1-1 曲面渲染


def test_wms_rejects_oversized_image(api):
    c, _ = api
    sig = create_tile_token("user-1", "task-1")
    r = c.get("/api/v1/spatial/wms/task-1", params={
        "sig": sig, "BBOX": "113,22,114,23", "WIDTH": 20000, "HEIGHT": 20000,
    })
    assert r.status_code == 422


@pytest.mark.parametrize("z,x,y", [(30, 0, 0), (-1, 0, 0), (2, 4, 0), (2, 0, -1)])
def test_xyz_rejects_invalid_tile(api, z, x, y):
    c, _ = api
    sig = create_tile_token("user-1", "task-1")
    r = c.get(f"/api/v1/spatial/surface/task-1/xyz/{z}/{x}/{y}.png", params={"sig": sig})
    assert r.status_code == 400


def _seed_points(task_id: str, n: int = 400) -> None:
    rng = np.random.default_rng(0)
    lons = rng.uniform(113.5, 114.5, n)
    lats = rng.uniform(22.3, 23.0, n)
    pts = [{"lon": float(a), "lat": float(b), "coef": {"b0": float(np.sin(a * 5) + b)}}
           for a, b in zip(lons, lats)]
    storage.put_bytes(f"results/{task_id}/coefficients.json",
                      json.dumps({"points": pts, "columns": ["b0"]}).encode())


def _scalar_reference(task_id, bbox, w, h):
    """旧实现的逐像素语义（标量反解 + 逐点 IDW + 逐像素上色），用于比对向量化结果。"""
    d = surface.load_points_cached(task_id)
    lons, lats, vals = (np.asarray(d[k], float) for k in ("lons", "lats", "vals"))
    vmin, vmax = np.nanpercentile(vals, 5), np.nanpercentile(vals, 95)
    xs = np.linspace(bbox[0], bbox[2], w)
    ys = np.linspace(bbox[3], bbox[1], h)
    grid = np.zeros((h, w))
    for iy, y in enumerate(ys):
        for ix, x in enumerate(xs):
            wl, wt = crs_transform.gcj02_to_wgs84(float(x), float(y))
            dist = np.hypot(lons - wl, lats - wt)
            idx = np.argpartition(dist, 12)[:12]
            wgt = 1.0 / np.power(dist[idx] + 1e-12, 2.0)
            grid[iy, ix] = np.sum(wgt * vals[idx]) / np.sum(wgt)
    t = (np.clip(grid, vmin, vmax) - vmin) / (vmax - vmin)
    gray = (t * 255).astype(np.uint8)
    return np.array([[surface._colormap(g / 255.0) for g in row] for row in gray], np.uint8)


def test_vectorized_render_matches_scalar_reference():
    _seed_points("surf-eq")
    bbox = (113.8, 22.5, 114.1, 22.8)
    png = surface.render_bbox_png("surf-eq", *bbox, 40, 30)  # <256 宽：不降采样，可逐像素比对
    got = np.asarray(Image.open(io.BytesIO(png)))
    assert np.array_equal(got, _scalar_reference("surf-eq", bbox, 40, 30))


def test_render_clamps_size_even_when_called_directly():
    _seed_points("surf-big")
    png = surface.render_bbox_png("surf-big", 113.5, 22.3, 114.5, 23.0, 5000, 5000)
    assert Image.open(io.BytesIO(png)).size == (surface.MAX_RENDER_PX, surface.MAX_RENDER_PX)


def test_vectorized_crs_matches_scalar():
    lon = np.array([116.39, 121.47, 114.06, 10.0, 139.7])
    lat = np.array([39.91, 31.23, 22.54, 50.0, 35.6])
    vlon, vlat = crs_transform.gcj02_to_wgs84_np(lon, lat)
    for i in range(len(lon)):
        slon, slat = crs_transform.gcj02_to_wgs84(float(lon[i]), float(lat[i]))
        assert vlon[i] == pytest.approx(slon, abs=1e-12)
        assert vlat[i] == pytest.approx(slat, abs=1e-12)


# ---------------------------------------------------------------- P1-2 上传


@pytest.fixture
def upload_env(api, monkeypatch):
    monkeypatch.setattr(datasets_api, "redis_available", lambda: False)
    return api


def _init(c, **over):
    body = {"project_id": "proj-1", "filename": "d.csv", "size": 600_000,
            "chunk_size": 256 * 1024}
    body.update(over)
    return c.post("/api/v1/datasets/upload/init", json=body)


def test_single_upload_over_limit_is_413_without_full_read(upload_env, monkeypatch):
    c, db = upload_env
    monkeypatch.setattr(datasets_api, "_MAX", 1024)
    r = c.post("/api/v1/datasets/upload", data={"project_id": "proj-1"},
               files={"file": ("big.csv", b"a,b\n" + b"1,2\n" * 1000, "text/csv")})
    assert r.status_code == 413
    assert db.added == []


def test_init_rejects_bad_extension_and_bounds(upload_env):
    c, _ = upload_env
    assert _init(c, filename="evil.exe").status_code == 400
    assert _init(c, size=3 * 1024 ** 3).status_code == 413
    assert _init(c, chunk_size=1024 ** 3).status_code == 422
    assert _init(c, chunk_size=1).status_code == 422
    assert _init(c, size=0).status_code == 422
    # 超过单次上限的大文件只收 CSV/TSV
    big = settings.MAX_UPLOAD_MB * 1024 * 1024 + 1
    assert _init(c, filename="d.xlsx", size=big).status_code == 413
    assert _init(c, filename="d.csv", size=big).status_code == 200


def test_chunk_index_and_size_are_enforced(upload_env):
    c, _ = upload_env
    uid = _init(c).json()["upload_id"]  # 600000 / 262144 → 3 片，末片 75712 字节
    url = f"/api/v1/datasets/upload/{uid}/chunk"
    assert c.put(f"{url}/3", content=b"x").status_code == 400
    assert c.put(f"{url}/-1", content=b"x").status_code == 400
    assert c.put(f"{url}/999999", content=b"x").status_code == 400
    assert c.put(f"{url}/0", content=b"x" * (256 * 1024 + 1)).status_code == 413
    assert c.put(f"{url}/0", content=b"x" * 10).status_code == 400
    assert c.put(f"{url}/2", content=b"x" * 75712).status_code == 200


def test_chunked_upload_roundtrip_and_cleanup(upload_env):
    c, db = upload_env
    header = b"lon,lat,y\n"
    rows = b"".join(b"114.%04d,22.%04d,%d\n" % (i % 10000, i % 10000, i) for i in range(30000))
    data = header + rows
    cs = 256 * 1024
    uid = _init(c, size=len(data), chunk_size=cs).json()["upload_id"]
    total = (len(data) + cs - 1) // cs

    # 缺片时拒绝合并
    c.put(f"/api/v1/datasets/upload/{uid}/chunk/0", content=data[:cs])
    r = c.post(f"/api/v1/datasets/upload/{uid}/complete")
    assert r.status_code == 409
    assert r.json()["detail"]["missing_count"] == total - 1

    for i in range(1, total):
        r = c.put(f"/api/v1/datasets/upload/{uid}/chunk/{i}", content=data[i * cs:(i + 1) * cs])
        assert r.status_code == 200
    r = c.post(f"/api/v1/datasets/upload/{uid}/complete")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["size_bytes"] == len(data)
    assert body["row_count"] == 30000
    assert {f["name"] for f in body["schema"]} == {"lon", "lat", "y"}
    ds = db.added[-1]
    assert storage.get_bytes(ds.storage_path) == data
    # 分片和会话已清理，不能重复 complete
    assert not [k for k in storage.list_prefix(f"uploads/{uid}/") if "chunk_" in k]
    assert c.post(f"/api/v1/datasets/upload/{uid}/complete").status_code == 404


# ---------------------------------------------------------------- P1-3 训练/查询上限


BASE_REQ = dict(project_id="p", dataset_id="d", y_column="y",
                x_columns=["a"], spatial_columns=["lon", "lat"])


@pytest.mark.parametrize("hp", [
    {"max_epochs": 10 ** 9},
    {"max_epoch": 10 ** 9},
    {"hidden_layers": [100000, 100000]},
    {"hidden": [100000]},
    {"hidden_layers": [32] * 11},
    {"hidden_layers": []},
    {"batch_size": 10 ** 6},
    {"learning_rate": 0},
    {"dropout": 1.0},
    {"early_stopping_patience": 10 ** 9},
])
def test_hyperparams_out_of_range_rejected(hp):
    with pytest.raises(ValidationError):
        TrainRequest(hyperparams=hp, **BASE_REQ)


def test_hyperparams_frontend_max_values_accepted():
    hp = ModelHyperparams(hidden_layers=[1024] * 10, max_epochs=5000, batch_size=4096,
                          learning_rate=1, early_stopping_patience=500)
    assert hp.normalized()["max_epoch"] == 5000


def test_train_request_column_count_bounded():
    with pytest.raises(ValidationError):
        TrainRequest(**{**BASE_REQ, "x_columns": [f"c{i}" for i in range(201)]})


def test_tiles_and_preview_limits(api):
    c, _ = api
    base = {"dataset_id": "ds-1", "bbox": "113,22,114,23"}
    assert c.get("/api/v1/spatial/tiles", params={**base, "limit": 10_000_000}).status_code == 422
    assert c.get("/api/v1/spatial/tiles", params={**base, "limit": 0}).status_code == 422
    assert c.get("/api/v1/spatial/tiles", params={**base, "cursor": "abc"}).status_code == 422
    assert c.get("/api/v1/datasets/ds-1/preview", params={"rows": 10 ** 7}).status_code == 422


def _train_client(monkeypatch, active: int):
    db = FakeDB({(Project, "proj-1"): PROJ,
                 (Dataset, "ds-1"): SimpleNamespace(id="ds-1", project_id="proj-1")},
                active_tasks=active)
    monkeypatch.setattr(models_api.storage, "exists", lambda _k: True)
    enqueued = []
    monkeypatch.setattr(models_api, "enqueue", lambda *a, **k: (enqueued.append(a), ("cid", False))[1])
    monkeypatch.setattr(models_api, "task_out", lambda t: {
        "id": "t", "project_id": "proj-1", "dataset_id": "ds-1", "model_type": "GNNWR",
        "y_column": "y", "x_columns": ["a"], "spatial_columns": ["lon", "lat"],
        "status": "PENDING", "created_at": "2026-01-01T00:00:00"})
    app.dependency_overrides[get_current_user] = lambda: USER
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app), db, enqueued


def test_train_rejects_when_user_has_too_many_active_tasks(monkeypatch):
    body = {**BASE_REQ, "project_id": "proj-1", "dataset_id": "ds-1"}
    try:
        c, db, enqueued = _train_client(monkeypatch, settings.MAX_ACTIVE_TRAIN_TASKS_PER_USER)
        assert c.post("/api/v1/models/train", json=body).status_code == 429
        assert db.added == [] and enqueued == []

        c, db, enqueued = _train_client(monkeypatch, settings.MAX_ACTIVE_TRAIN_TASKS_PER_USER - 1)
        assert c.post("/api/v1/models/train", json=body).status_code == 202
        assert len(enqueued) == 1
    finally:
        app.dependency_overrides.clear()


def test_celery_tasks_have_time_limits():
    assert celery_app.conf.task_time_limit and celery_app.conf.task_soft_time_limit
    assert training.train_task.soft_time_limit == settings.TRAIN_SOFT_TIME_LIMIT_S
    assert training.train_task.time_limit == settings.TRAIN_TIME_LIMIT_S
    assert training.train_task.time_limit > training.train_task.soft_time_limit
    from app.tasks.ingest_task import preprocess_task
    assert preprocess_task.soft_time_limit == settings.PREPROCESS_SOFT_TIME_LIMIT_S


class _TaskDB(FakeDB):
    def __init__(self, task):
        super().__init__({(ModelTask, task.id): task})


def _patch_side_effects(monkeypatch):
    sent = []
    monkeypatch.setattr(training, "append_log", lambda *a, **k: None)
    monkeypatch.setattr(training, "mark_started", lambda *a, **k: None)
    monkeypatch.setattr(training, "publish_progress", lambda _tid, msg: sent.append(msg))
    return sent


def test_redelivered_running_task_is_failed_not_rerun(monkeypatch):
    task = SimpleNamespace(id="t-run", status="RUNNING", celery_task_id="c")
    monkeypatch.setattr(training, "SessionLocal", lambda: _TaskDB(task))
    _patch_side_effects(monkeypatch)
    monkeypatch.setattr(training.storage, "local_path",
                        lambda _k: (_ for _ in ()).throw(AssertionError("must not retrain")))
    out = training.run_train("t-run", "k")
    assert out["error_code"] == "WORKER_LOST"
    assert task.status == "FAILED" and task.error_code == "WORKER_LOST"


def test_cancelled_pending_task_is_skipped(monkeypatch):
    task = SimpleNamespace(id="t-c", status="FAILED", error_code="TASK_CANCELLED")
    monkeypatch.setattr(training, "SessionLocal", lambda: _TaskDB(task))
    _patch_side_effects(monkeypatch)
    out = training.run_train("t-c", "k")
    assert out.get("skipped") is True
    assert task.status == "FAILED" and task.error_code == "TASK_CANCELLED"


def test_soft_time_limit_marks_task_timeout(monkeypatch):
    task = SimpleNamespace(id="t-to", status="PENDING", celery_task_id=None, model_type="GNNWR")
    monkeypatch.setattr(training, "SessionLocal", lambda: _TaskDB(task))
    sent = _patch_side_effects(monkeypatch)

    def boom(_k):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(training.storage, "local_path", boom)
    out = training.run_train("t-to", "k")
    assert out["error_code"] == "TASK_TIMEOUT"
    assert task.status == "FAILED" and task.error_code == "TASK_TIMEOUT"
    assert sent[-1]["status"] == "FAILED"
