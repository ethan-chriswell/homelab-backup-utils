FROM node:24-alpine AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine AS backend
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ ./backend/
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

ENV PORT=3000 \
    SETTINGS_PATH=/data/settings.json \
    DEBUG=false

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/api/config || exit 1
ENTRYPOINT ["node", "backend/src/index.js"]
