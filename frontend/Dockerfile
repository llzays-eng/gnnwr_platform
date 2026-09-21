FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VITE_API_BASE_URL=
ARG VITE_WS_BASE_URL=
ARG VITE_AMAP_KEY=
ARG VITE_AMAP_SECURITY_CODE=
ARG VITE_ENABLE_MOCK=false
ARG VITE_MOCK_ASSUME_PENDING_CONTRACTS=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_BASE_URL=$VITE_WS_BASE_URL \
    VITE_AMAP_KEY=$VITE_AMAP_KEY \
    VITE_AMAP_SECURITY_CODE=$VITE_AMAP_SECURITY_CODE \
    VITE_ENABLE_MOCK=$VITE_ENABLE_MOCK \
    VITE_MOCK_ASSUME_PENDING_CONTRACTS=$VITE_MOCK_ASSUME_PENDING_CONTRACTS
RUN pnpm build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
