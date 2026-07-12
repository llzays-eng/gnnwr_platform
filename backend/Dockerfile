FROM python:3.12-slim

# GDAL/GEOS 等地理库 + weasyprint 渲染依赖（按需保留）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev libgeos-dev libpq-dev gcc g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 同时拷入 engine（后端与 Celery worker 都要 import 顶层 engine 包）
COPY backend/ /app/
COPY engine/ /app/engine/

ENV PYTHONPATH=/app
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
