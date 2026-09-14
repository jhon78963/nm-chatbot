# Admin Panel — Novedades Maritex (WhatsApp Malu)

Panel React para que los asesores atiendan conversaciones de WhatsApp cuando Malu deriva a un humano (handoff).

## Stack

- React 18 + TypeScript + Vite 6
- react-router-dom v6
- CSS propio (mobile-friendly)

## URLs

| Entorno | Panel admin | API backend |
|---|---|---|
| Dev (Vite) | http://localhost:5173 | proxy → http://localhost:8090 |
| Dev (Express) | http://localhost:8090/admin | http://localhost:8090/api/v1 |
| Docker NM | http://localhost:8090/admin | mismo host |
| Prod (futuro) | vía `nm-frontend-v2` → `/chatbot` (iframe) | gateway `/api/v1/chatbot/*` |

## Credenciales iniciales

Creadas con `npm run create:agents:nm` (PostgreSQL `chat_agents`):

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin` | `nm2026!` | admin |
| `asesor1.nm` | `nm2026!` | agent |
| `asesor2.nm` | `nm2026!` | agent |

Email admin: `admin@novedadesmaritex.net.pe`

**Cambiar contraseñas** tras el primer login en producción.

## Desarrollo local

```bash
# Backend (desde services/chatbot)
npm run dev

# Admin React (otra terminal)
npm run admin:dev
# → http://localhost:5173
```

El proxy de Vite apunta al backend en `admin/.env.development` (`VITE_DEV_API_PROXY`).

## Build producción

```bash
npm run build:all    # backend + admin
# Admin incluido en imagen Docker → /admin en el mismo servidor
```

## Gestión de agentes

### Sincronizar admins ERP → chat_agents (SSO)

El panel chatbot (SSO desde ERP) busca agente por `username` o `userId` (= `users.id` del JWT).

```bash
cd services/chatbot
npm run create:agents:nm      # upsert admins ERP + asesores manuales
npm run verify:agents:erp     # solo verificar (exit 1 si falta alguno)
```

Edita `deploy/create-nm-agents.mjs` → `MANUAL_SUPPORT_AGENTS` para asesores WhatsApp sin cuenta ERP.

### Resetear contraseña

```bash
npm run reset:password -- admin nuevaPassword123
# o
node --env-file=.env deploy/reset-agent-password.mjs asesor1.nm nm2026!
```

### Listar agentes (Mongo legacy — solo si usas MONGODB_URI)

```bash
node --env-file=.env deploy/list-agents.mjs
```

En NM los agentes están en PostgreSQL tabla `chat_agents`.

## Quick replies

Los atajos de respuesta están en PostgreSQL (`chat_quick_replies`).

Seed inicial (desde raíz `nm-backend-v3`):

```bash
npm run seed:chatbot
```

Los agentes pueden crear/editar quick replies desde el panel (menú lateral).

## Flujo de uso del panel

1. Abrir el panel → login con usuario y contraseña.
2. **Inbox**: chats asignados y leads recientes (polling + WebSocket).
3. Abrir un chat → historial, responder al cliente por WhatsApp.
4. **Quick replies**: atajos predefinidos para respuestas frecuentes.
5. **Devolver al bot**: Malu retoma la conversación.
6. **Admin**: reasignar chats, ver todos los inbox (rol `admin`).

## Verificar login (API)

```bash
curl -s -X POST http://localhost:8090/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"nm2026!"}'
```

Respuesta esperada: JSON con `token` y datos del agente.

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | PostgreSQL compartido con nm-backend-v3 |
| `JWT_SECRET` | Token de sesión del panel |
| `VITE_DEV_API_PROXY` | URL backend en dev (admin) |

## Seguridad

- El `agentId` se extrae del JWT en el backend; el cliente no lo envía.
- `401` → logout automático.
- `403` → chat no asignado al agente actual.
