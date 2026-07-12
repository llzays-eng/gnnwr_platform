# ---- 构建阶段 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --registry=https://registry.npmmirror.com || npm install
COPY . .
# Vite 的 VITE_* 变量在「构建期」烘焙进产物，不是运行期读取——
# 因此高德 key 必须以 build-arg 方式传入（见 docker-compose.yml 的 args）。
# 不传则为空，前端自动降级为离线 Canvas 渲染，构建照常成功。
ARG VITE_AMAP_KEY=""
ARG VITE_AMAP_SECURITY=""
ENV VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_AMAP_SECURITY=$VITE_AMAP_SECURITY
RUN npm run build

# ---- 运行阶段 ----
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
