# ── Stage 1: Backend regression tests ────────────────────────────────────────
# Runs unit + integration tests. A non-zero exit stops the build before any
# production image is produced.
FROM node:24-alpine AS test
WORKDIR /app
# Install all deps, including devDependencies (undici mock agent)
COPY mealie-backup/backend/package*.json ./
RUN npm ci
# Mirror repo structure so relative imports (../../../common/…) resolve correctly
COPY mealie-backup/backend/ ./mealie-backup/backend/
COPY common/backend/ ./common/backend/
RUN cd mealie-backup/backend && npm test && touch /tests-passed

# ── Stage 2: Frontend build ───────────────────────────────────────────────────
FROM node:24-alpine AS frontend-builder
# Mirror repo structure: ../../common/frontend resolves from the service frontend dir
WORKDIR /build/mealie-backup/frontend
COPY mealie-backup/frontend/package*.json ./
RUN npm ci
COPY mealie-backup/frontend/ ./
COPY common/frontend/ /build/common/frontend/
RUN npm run build

# ── Stage 3: Production image ─────────────────────────────────────────────────
FROM node:24-alpine AS backend
WORKDIR /app
# Install deps at /app — reachable from both mealie-backup/backend/ and common/ via Node's upward search
COPY mealie-backup/backend/package*.json ./
RUN npm ci --omit=dev
# Mirror repo structure: ../../../common/backend resolves from mealie-backup/backend/src/
COPY mealie-backup/backend/ ./mealie-backup/backend/
COPY common/backend/ ./common/backend/
COPY --from=frontend-builder /build/mealie-backup/frontend/dist ./mealie-backup/frontend/dist
# Hard gate: this COPY only succeeds if the test stage completed without error
COPY --from=test /tests-passed /tmp/tests-passed
RUN rm /tmp/tests-passed

ENV PORT=3000 \
    SETTINGS_PATH=/data/settings.json \
    DEBUG=false

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
ENTRYPOINT ["node", "mealie-backup/backend/src/index.js"]
