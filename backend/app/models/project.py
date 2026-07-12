from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Project(Base):
    """分析项目：绑定应用场景类型（air_quality / housing_price / custom）。"""
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    scenario_type: Mapped[str] = mapped_column(String(50), default="custom")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    datasets: Mapped[list["Dataset"]] = relationship(back_populates="project",
                                                     cascade="all, delete-orphan")


class Dataset(Base):
    """数据集元数据：实际文件存 MinIO，这里只存路径与状态。"""
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True,
                                    default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(String(200), default="")
    storage_path: Mapped[str] = mapped_column(String(300))         # MinIO 对象 key
    file_type: Mapped[str] = mapped_column(String(20))             # csv/geojson/shp/xlsx
    source_crs: Mapped[str] = mapped_column(String(30), default="WGS84")
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded/cleaned/ingested/failed
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    project: Mapped["Project"] = relationship(back_populates="datasets")
