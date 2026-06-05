FROM node:24-alpine AS frontend-builder
# Mirror repo structure: ../../common/frontend resolves from the service frontend dir
WORKDIR /build/arr-backup/frontend
COPY arr-backup/frontend/package*.json ./
RUN npm ci
COPY arr-backup/frontend/ ./
COPY common/frontend/ /build/common/frontend/
RUN npm run build

FROM node:24-alpine AS backend
WORKDIR /app
# Install deps at /app — reachable from both arr-backup/backend/ and common/ via Node's upward search
COPY arr-backup/backend/package*.json ./
RUN npm ci --omit=dev
# Mirror repo structure: ../../../common/backend resolves from arr-backup/backend/src/
COPY arr-backup/backend/ ./arr-backup/backend/
COPY common/backend/ ./common/backend/
COPY --from=frontend-builder /build/arr-backup/frontend/dist ./arr-backup/frontend/dist

ENV PORT=3000 \
    SETTINGS_PATH=/data/settings.json \
    DEBUG=false

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["node", "arr-backup/backend/src/index.js"]
