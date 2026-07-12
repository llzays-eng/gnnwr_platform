"""
对象存储（大纲 3.4 MinIO）
=========================
存放原始上传文件、模型权重(.pth)、PDF 报告、导出的栅格结果。
优先用 MinIO；若未配置/不可用，自动回退本地磁盘（一期单体部署可直接用），
接口保持一致，后续切换 MinIO 零改动。
"""
from __future__ import annotations

import io
import os
import shutil
from pathlib import Path

from app.core.config import settings


class StorageService:
    def __init__(self) -> None:
        self._minio = None
        self._local_dir = Path(settings.LOCAL_STORAGE_DIR)
        try:
            from minio import Minio  # 延迟导入，未安装则回退
            self._minio = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE,
            )
            if not self._minio.bucket_exists(settings.MINIO_BUCKET):
                self._minio.make_bucket(settings.MINIO_BUCKET)
        except Exception:
            self._minio = None
            self._local_dir.mkdir(parents=True, exist_ok=True)

    @property
    def backend(self) -> str:
        return "minio" if self._minio else "local"

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        if self._minio:
            self._minio.put_object(settings.MINIO_BUCKET, key, io.BytesIO(data),
                                   length=len(data), content_type=content_type)
        else:
            path = self._local_dir / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return key

    def put_file(self, key: str, file_path: str) -> str:
        if self._minio:
            self._minio.fput_object(settings.MINIO_BUCKET, key, file_path)
        else:
            dst = self._local_dir / key
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(file_path, dst)
        return key

    def get_bytes(self, key: str) -> bytes:
        if self._minio:
            resp = self._minio.get_object(settings.MINIO_BUCKET, key)
            try:
                return resp.read()
            finally:
                resp.close()
                resp.release_conn()
        return (self._local_dir / key).read_bytes()

    def local_path(self, key: str) -> str:
        """返回一个本地可读路径（Celery worker 需要文件路径时用）。"""
        if self._minio:
            tmp = Path("/tmp/gnnwr-cache") / key
            tmp.parent.mkdir(parents=True, exist_ok=True)
            self._minio.fget_object(settings.MINIO_BUCKET, key, str(tmp))
            return str(tmp)
        return str(self._local_dir / key)


storage = StorageService()
