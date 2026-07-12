from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ModelTask(Base):
    __tablename__ = "model_tasks"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"))
    dataset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("datasets.id"))
    model_type: Mapped[str] = mapped_column(String(10))          # GNNWR / GTNNWR
    x_columns: Mapped[list] = mapped_column(JSONB)
    y_column: Mapped[str] = mapped_column(String(100))
    spatial_columns: Mapped[list] = mapped_column(JSONB)
    temporal_column: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hyperparams: Mapped[dict] = mapped_column(JSONB, default=dict)
    celery_task_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING/RUNNING/SUCCESS/FAILED
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)

    result: Mapped["ModelResult"] = relationship(back_populates="task",
                                                 uselist=False, cascade="all, delete-orphan")
    baselines: Mapped[list["BaselineComparison"]] = relationship(
        back_populates="task", cascade="all, delete-orphan")


class ModelResult(Base):
    __tablename__ = "model_results"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("model_tasks.id"))
    r2: Mapped[float] = mapped_column(Float, nullable=True)
    rmse: Mapped[float] = mapped_column(Float, nullable=True)
    mae: Mapped[float] = mapped_column(Float, nullable=True)
    aicc: Mapped[float] = mapped_column(Float, nullable=True)
    model_weight_path: Mapped[str | None] = mapped_column(String(300), nullable=True)  # MinIO .pth
    coefficients_summary: Mapped[dict] = mapped_column(JSONB, default=dict)  # 全局系数 + 逐点系数索引
    residuals_path: Mapped[str | None] = mapped_column(String(300), nullable=True)

    task: Mapped["ModelTask"] = relationship(back_populates="result")


class BaselineComparison(Base):
    __tablename__ = "baseline_comparisons"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("model_tasks.id"))
    method: Mapped[str] = mapped_column(String(20))   # OLS/GWR/GTWR/RandomForest
    r2: Mapped[float] = mapped_column(Float, nullable=True)
    rmse: Mapped[float] = mapped_column(Float, nullable=True)
    mae: Mapped[float] = mapped_column(Float, nullable=True)

    task: Mapped["ModelTask"] = relationship(back_populates="baselines")
