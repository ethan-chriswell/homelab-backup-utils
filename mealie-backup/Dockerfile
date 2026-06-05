FROM node:24-alpine AS frontend-builder
# Mirror repo structure: ../../common/frontend resolves from the service frontend dir
WORKDIR /build/mealie-backup/frontend
COPY mealie-backup/frontend/package*.json ./
RUN npm ci
COPY mealie-backup/frontend/ ./
COPY common/frontend/ /build/common/frontend/
RUN npm run build

FROM node:24-alpine AS backend
WORKDIR /app
# Install deps at /app — reachable from both mealie-backup/backend/ and common/ via Node's upward search
COPY mealie-backup/backend/package*.json ./
RUN npm ci --omit=dev
# Mirror repo structure: ../../../common/backend resolves from mealie-backup/backend/src/
COPY mealie-backup/backend/ ./mealie-backup/backend/
COPY common/backend/ ./common/backend/
COPY --from=frontend-builder /build/mealie-backup/frontend/dist ./mealie-backup/frontend/dist

ENV PORT=3000 \
    SETTINGS_PATH=/data/settings.json \
    DEBUG=false

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["node", "mealie-backup/backend/src/index.js"]
