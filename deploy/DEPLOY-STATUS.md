# NM Chatbot — Estado de despliegue e verificación E2E

Generado: 2026-09-03

## Resumen

Integración del chatbot Malu en el ecosistema Novedades Maritex. Código en `nm-backend-v3/services/chatbot`.

| PROMPT | Tarea | Estado |
|--------|-------|--------|
| 1 | `.env` NM | ✅ |
| 2 | Prisma + repos | ✅ |
| 3 | Branding Malu/Maritex | ✅ |
| 4 | Iframe en `nm-frontend-v2` | ✅ |
| 5 | Proxy gateway | ✅ (requiere rebuild + restart gateway) |
| 6 | Backup/restore config | ✅ |
| 7 | Sync productos → RAG | ✅ |
| 8 | Docker (sin Grafana) | ✅ |
| 9 | Agentes NM | ✅ |
| 10 | Verificación E2E | Ver abajo |

---

## Verificación E2E (2026-09-03)

### 1. Health check — chatbot (`:8090`)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `GET /health` | ✅ | `{"status":"ok","service":"nm-chatbot"}` |
| `POST /api/v1/auth/login` sin credenciales | ✅ | HTTP 400 — `username y password son requeridos` |
| `POST /api/v1/auth/login` admin | ✅ | JWT devuelto con `admin` / `nm2026!` |
| WebSocket `ws://…/api/v1/ws` | ⏳ | No probado en esta sesión; requiere JWT en query/header |

### 2. Webhook Meta

| Check | Resultado | Notas |
|-------|-----------|-------|
| `GET /webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=TEST` | ✅ | Responde `TEST` con `META_WEBHOOK_VERIFY_TOKEN` del `.env` |

### 3. Admin panel

| Check | Resultado | Notas |
|-------|-----------|-------|
| `GET /admin/` (tras `npm run admin:build`) | ✅ | HTTP 200, HTML React |
| Login admin NM | ✅ | vía API directa `:8090` |

### 4. Gateway proxy (`:3000`)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `GET /api/v1/chatbot/health` | ⚠️ | Gateway en `:3000` sin rebuild → 401. Con gateway **recompilado** el routing es correcto (`→ chatbot /health`). **Reiniciar gateway** tras `npm run build:gateway`. |
| `POST /api/v1/chatbot/auth/login` | ⚠️ | Mismo caso: reiniciar gateway con `CHATBOT_SERVICE_URL` |

### 5. Frontend Angular (`:4200`)

| Check | Resultado | Notas |
|-------|-----------|-------|
| `http://localhost:4200/chatbot` | ⏳ | Módulo implementado; verificar manualmente con Angular + admin Vite (`:5173`) o `:8090/admin` |

---

## Scripts operativos

```bash
cd nm-backend-v3/services/chatbot

npm run create:agents:nm      # agentes NM
npm run sync:products         # catálogo → chat_context_data
npm run backup:chatbot        # export JSON a deploy/seeds/
NM_AGENT_PASSWORD='…' npm run restore:chatbot
npm run dev                   # backend (usar PORT=8090 si gateway usa :3000)
npm run admin:dev             # panel React :5173
npm run build:all             # backend + admin para Docker
```

Desde raíz `nm-backend-v3`:

```bash
npm run seed:chatbot
npm run build:gateway && npm run start:dev:gateway
```

---

## Variables de entorno — completar manualmente

| Variable | Ubicación | Descripción |
|----------|-----------|-------------|
| `DEEPSEEK_API_KEY` | `services/chatbot/.env` | API DeepSeek (`deepseek-v4-flash`) |
| `META_WHATSAPP_TOKEN` | `.env` | Token permanente WhatsApp Cloud API |
| `META_PHONE_NUMBER_ID` | `.env` | ID del número WA Business |
| `META_WEBHOOK_VERIFY_TOKEN` | `.env` | Token de verificación webhook (Meta Console) |
| `WEBHOOK_SECRET` | `.env` | App Secret Meta (firma `X-Hub-Signature-256`) |
| `JWT_SECRET` | `.env` | Secreto JWT agentes del panel |
| `PORT` | `.env` | Usar `8090` en local si gateway usa `3000` |
| `CHATBOT_SERVICE_URL` | `nm-backend-v3/.env` | `http://localhost:8090` (local) |
| `chatbotAdminUrl` | `nm-frontend-v2` environments | URL del iframe admin |

---

## URLs producción (placeholders)

| Servicio | URL |
|----------|-----|
| API gateway | `https://api.novedadesmaritex.net.pe` |
| Admin ERP | `https://app.novedadesmaritex.net.pe` |
| Chatbot admin (iframe) | `https://chatbot.novedadesmaritex.net.pe/admin` |
| Tienda | `https://novedadesmaritex.net.pe` |
| Proxy chatbot API | `https://api.novedadesmaritex.net.pe/api/v1/chatbot/*` |

---

## Próximos pasos

1. Reiniciar gateway con build actual (`CHATBOT_SERVICE_URL` + bypass JWT chatbot).
2. Configurar credenciales Meta WhatsApp en `.env`.
3. Apuntar webhook Meta a `https://<dominio>/webhook`.
4. Verificar `/chatbot` en Angular con admin en `:5173` o build en `:8090/admin`.
5. Cambiar contraseñas de agentes tras primer login en producción.
6. Programar `npm run sync:products` tras cambios de catálogo (cron o CI).

---

## Credenciales iniciales (desarrollo)

| Usuario | Contraseña | Rol |
|---------|------------|-----|
| `admin` | `nm2026!` | admin |
| `asesor1.nm` | `nm2026!` | agent |
| `asesor2.nm` | `nm2026!` | agent |
