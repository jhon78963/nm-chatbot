# ═══════════════════════════════════════════════════════════════════════════════
#  nm-chatbot — Multi-stage build (context: nm-backend-v3 root)
# ═══════════════════════════════════════════════════════════════════════════════
FROM node:24-alpine AS prod-deps

WORKDIR /app

COPY services/chatbot/package*.json ./

RUN npm ci --omit=dev --ignore-scripts


FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl libc6-compat

COPY services/chatbot/package*.json ./
RUN npm ci --ignore-scripts

COPY libs/database/prisma/schema.prisma ./prisma/schema.prisma
COPY services/chatbot/tsconfig.json ./
COPY services/chatbot/src ./src

RUN npx prisma generate --schema=./prisma/schema.prisma
RUN npx tsc --project tsconfig.json


FROM node:24-alpine AS admin-build

WORKDIR /app/admin

COPY services/chatbot/admin/package*.json ./
RUN npm ci --ignore-scripts

COPY services/chatbot/admin/tsconfig*.json services/chatbot/admin/vite.config.ts services/chatbot/admin/index.html ./
COPY services/chatbot/admin/src ./src

ENV VITE_BASE_PATH=/admin/
RUN npm run build


FROM node:24-alpine AS production

LABEL org.opencontainers.image.title="nm-chatbot"
LABEL org.opencontainers.image.description="Chatbot NM — Maritex WhatsApp, Node 24, PostgreSQL"
LABEL org.opencontainers.image.vendor="Novedades Maritex"

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

RUN apk add --no-cache openssl libc6-compat wget

WORKDIR /app

COPY --from=prod-deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=appuser:appgroup /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=admin-build --chown=appuser:appgroup /app/admin/dist ./admin/dist
COPY --chown=appuser:appgroup services/chatbot/package.json ./
COPY --chown=appuser:appgroup services/chatbot/context ./context

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
