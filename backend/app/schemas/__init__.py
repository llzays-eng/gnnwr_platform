"""Pydantic v2 请求/响应模型。字段命名与 ORM / 大纲 API 对齐。"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------------- 认证 ---------------- #
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    id: str
    email: EmailStr
    username: str
    role: str

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


# ---------------- 项目 ---------------- #
class ProjectCreate(BaseModel):
    name: str
    scenario_type: str = Field(default="custom",
                               description="air_quality | housing_price | custom")


class ProjectOut(BaseModel):
    id: str
    name: str
    scenario_type: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------- 数据集 ---------------- #
class DatasetOut(BaseModel):
    id: str
    name: str
    file_type: str
    source_crs: str
    row_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class PreprocessRequest(BaseModel):
    y: str
    x: list[str]
    lon: str
    lat: str
    temporal: str | None = None
    source_crs: str = "WGS84"


class PreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]                 # 前 N 行
    n_rows_total: int
    mapping_suggestion: dict         # 字段映射器输出
    points: list[dict]               # 地图打点 [{lon,lat}]（已纠偏到 GCJ-02）


# ---------------- 建模 ---------------- #
class Hyperparams(BaseModel):
    hidden: list[int] = Field(default_factory=lambda: [64, 32])
    dropout: float = 0.0
    lr: float = 3e-3
    max_epoch: int = 200
    patience: int = 30
    batch_size: int | None = None


class TrainRequest(BaseModel):
    project_id: str
    dataset_id: str
    model_type: str = Field(default="GNNWR", description="GNNWR | GTNNWR")
    y_column: str
    x_columns: list[str]
    spatial_columns: list[str]       # [lon, lat]
    temporal_column: str | None = None
    test_ratio: float = 0.2
    valid_ratio: float = 0.1
    hyperparams: Hyperparams = Field(default_factory=Hyperparams)


class TaskStatusOut(BaseModel):
    task_id: str
    status: str
    progress: float
    model_type: str
    error: str | None = None

    class Config:
        from_attributes = True


class Metrics(BaseModel):
    r2: float | None = None
    rmse: float | None = None
    mae: float | None = None
    aicc: float | None = None


class ResultOut(BaseModel):
    task_id: str
    status: str
    model_type: str
    metrics: Metrics
    beta_ols: dict
    coefficients_key: str | None = None


class BaselineOut(BaseModel):
    method: str
    r2: float | None = None
    rmse: float | None = None
    mae: float | None = None


class CompareOut(BaseModel):
    task_id: str
    model_type: str
    main: Metrics
    baselines: list[BaselineOut]
