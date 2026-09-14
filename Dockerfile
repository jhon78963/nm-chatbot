# ═══════════════════════════════════════════════════════════════════════════════
#  nm-chatbot — Multi-stage build
#  Contexto de build: nm-chatbot/  (raíz del repositorio)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Etapa 1: dependencias de producción ────────────────────────────────────────
FROM node:24-alpine AS prod-deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts


# ── Etapa 2: compilación TypeScript + generación de ambos clientes Prisma ──────
FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
RUN npm ci --ignore-scripts

# Copiar ambos schemas antes de generar clientes
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
COPY deploy ./deploy

# npm run build = prepare:prisma (genera chatbot client + catalog client) + tsc
RUN npm run build


# ── Etapa 3: build del panel de administración (Vite / React) ─────────────────
FROM node:24-alpine AS admin-build

WORKDIR /app/admin

COPY admin/package*.json ./
RUN npm ci --ignore-scripts

COPY admin/tsconfig*.json admin/vite.config.ts admin/index.html ./
COPY admin/src ./src

ENV VITE_BASE_PATH=/admin/
RUN npm run build


# ── Etapa 4: imagen de producción mínima ──────────────────────────────────────
FROM node:24-alpine AS production

LABEL org.opencontainers.image.title="nm-chatbot"
LABEL org.opencontainers.image.description="Chatbot NM — Maritex WhatsApp, Node 24, PostgreSQL"
LABEL org.opencontainers.image.vendor="Novedades Maritex"

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk add --no-cache openssl libc6-compat wget

WORKDIR /app

COPY --from=prod-deps   --chown=appuser:appgroup /app/node_modules                ./node_modules
COPY --from=builder     --chown=appuser:appgroup /app/dist                        ./dist
COPY --from=builder     --chown=appuser:appgroup /app/node_modules/.prisma        ./node_modules/.prisma
COPY --from=builder     --chown=appuser:appgroup /app/node_modules/@prisma        ./node_modules/@prisma
# Cliente del catálogo: imports desde dist/infrastructure/... → ../../../generated/catalog-client
COPY --from=builder     --chown=appuser:appgroup /app/src/generated/catalog-client ./dist/generated/catalog-client
COPY --from=admin-build --chown=appuser:appgroup /app/admin/dist                  ./admin/dist
COPY --chown=appuser:appgroup package.json ./

RUN mkdir -p /app/uploads /app/logs && chown -R appuser:appgroup /app/uploads /app/logs

ENV NODE_ENV=production
ENV PORT=3000
ENV ADMIN_PANEL_DIST=/app/admin/dist

USER appuser
EXPOSE 3000

HEALTHCHECK \
  --interval=30s \
  --timeout=5s \
  --start-period=20s \
  --retries=3 \
  CMD wget -qO- http://localhost:${PORT}/health || exit 1

CMD ["node", "dist/main.js"]
