-- ============================================================
-- GNNWR 平台数据库初始化（对齐大纲第五章）
-- 容器首次启动时自动执行：建 PostGIS 扩展 + 核心表 + 空间索引。
-- ============================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(200) UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  hashed_password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',            -- guest / user / admin
  created_at TIMESTAMP DEFAULT now()
);

-- 项目表：每个用户可创建多个分析项目，绑定应用场景类型
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  scenario_type VARCHAR(50) DEFAULT 'custom', -- air_quality | housing_price | custom
  created_at TIMESTAMP DEFAULT now()
);

-- 数据集元数据表：实际文件存 MinIO，这里只存路径与状态
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(200) DEFAULT '',
  storage_path VARCHAR(300) NOT NULL,
  file_type VARCHAR(20),                      -- csv / geojson / shp / xlsx
  source_crs VARCHAR(30) DEFAULT 'WGS84',
  row_count INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'uploaded',      -- uploaded/cleaning/cleaned/ingested/failed
  created_at TIMESTAMP DEFAULT now()
);

-- 标准化地理要素表：清洗后统一入库，建立空间索引
CREATE TABLE IF NOT EXISTS spatial_features (
  id BIGSERIAL PRIMARY KEY,
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  geom GEOMETRY(Point, 4326),
  observed_time TIMESTAMP,                     -- 时空场景使用，纯空间场景可为空
  properties JSONB                             -- 动态属性字段，适配不同场景的 X 变量集合
);
CREATE INDEX IF NOT EXISTS idx_spatial_features_geom
  ON spatial_features USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_spatial_features_dataset
  ON spatial_features(dataset_id);
CREATE INDEX IF NOT EXISTS idx_spatial_features_time
  ON spatial_features(observed_time);

-- 建模任务表
CREATE TABLE IF NOT EXISTS model_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES datasets(id) ON DELETE CASCADE,
  model_type VARCHAR(10),                      -- GNNWR | GTNNWR
  x_columns JSONB,
  y_column VARCHAR(100),
  spatial_columns JSONB,
  temporal_column VARCHAR(100),
  hyperparams JSONB,                           -- 隐藏层结构/dropout/batch_size/epoch/lr...
  celery_task_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'PENDING',        -- PENDING/RUNNING/SUCCESS/FAILED
  progress DOUBLE PRECISION DEFAULT 0,
  error VARCHAR(500),
  created_at TIMESTAMP DEFAULT now(),
  finished_at TIMESTAMP
);

-- 模型结果表
CREATE TABLE IF NOT EXISTS model_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES model_tasks(id) ON DELETE CASCADE,
  r2 FLOAT, rmse FLOAT, mae FLOAT, aicc FLOAT,
  model_weight_path VARCHAR(300),              -- MinIO 中 .pth 路径
  coefficients_summary JSONB,
  residuals_path VARCHAR(300)
);

-- 基线对比表：用于精度对比报告
CREATE TABLE IF NOT EXISTS baseline_comparisons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID REFERENCES model_tasks(id) ON DELETE CASCADE,
  method VARCHAR(20),                          -- OLS / GWR / GTWR / RandomForest
  r2 FLOAT, rmse FLOAT, mae FLOAT
);
