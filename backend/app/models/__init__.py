"""ORM 模型集中导出（供 Base.metadata 发现所有表）。"""
from app.models.model_task import BaselineComparison, ModelResult, ModelTask
from app.models.project import Dataset, Project
from app.models.spatial_feature import SpatialFeature
from app.models.user import User

__all__ = [
    "User", "Project", "Dataset", "SpatialFeature",
    "ModelTask", "ModelResult", "BaselineComparison",
]
