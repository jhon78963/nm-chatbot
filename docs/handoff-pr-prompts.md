# Prompts de implementación — Human Handoff tipo Movistar

Copia y pega **un prompt completo por sesión** en Cursor (Agent mode). Ejecuta en orden: **PR #1 → #2 → #3 → #4 → #5**.

**Repo:** `chatbot-uprit` — Node 24, TypeScript, Express, MongoDB, Meta WhatsApp Cloud API, Clean Architecture.

**Objetivo final:** En el mismo chat WhatsApp con UPRIT, Angela (bot) atiende hasta handoff; luego un asesor responde desde panel React en **`https://admision.uprit.edu.pe`**, con **usuario y contraseña propios**, viendo **solo sus chats asignados**.

---

## Con qué agente / modelo ejecutar cada PR (Cursor)

Usa siempre **Agent** (modo agente con permiso de editar archivos y correr terminal). **No uses Ask** (solo lectura) ni **Plan** (solo diseño).

| PR | Modo Cursor | Modelo recomendado | Alternativa | Por qué |
|----|-------------|-------------------|-------------|---------|
| **#1** | **Agent** | **Claude Sonnet** (thinking) o **GPT-5 Codex** | Composer | Toca domain + use case + Mongo; hay que respetar Clean Architecture |
| **#2** | **Agent** | **Claude Sonnet** (thinking) o **GPT-5 Codex** | Opus (si falla auth) | JWT + bcrypt + middleware; errores de seguridad son críticos |
| **#3** | **Agent** | **GPT-5 Codex** o **Claude Sonnet** | Composer | Varios use cases + routes REST; mucho código TypeScript |
| **#4** | **Agent** | **Claude Sonnet** o **GPT-5 Codex** | — | React + Vite + auth context + polling; el PR más grande en UI |
| **#5** | **Agent** | **Composer** o **GPT-5 Codex** | Terminal manual | Nginx, deploy, Docker; menos lógica de negocio |
| **Final E2E** | **Agent** | **Composer** o el mismo de PR #5 | — | Checklist, typecheck, pruebas integración |

### Reglas prácticas

1. **Un PR = un chat nuevo en Agent** (evita mezclar contexto de PRs anteriores).
2. Al abrir el chat, selecciona **Agent** en el selector de modo (parte inferior o superior del chat).
3. En el selector de **modelo**, elige el de la tabla (ej. *Claude Sonnet*, *GPT-5 Codex*, *Composer*).
4. Si no ves esos nombres exactos, usa el **modelo más capaz disponible** para PR #1–#4 y el **más rápido** para PR #5 y E2E.
5. Pega **Prompt 0** + el PR si es chat nuevo o cambiaste de dispositivo.
6. Tras cada PR: revisa diff, `npm run typecheck`, **commit**, luego siguiente PR en **chat nuevo**.

### Si algo sale mal

| Problema | Qué hacer |
|----------|-----------|
| El agente solo explica y no edita | Cambia a **Agent**, no Ask/Plan |
| Typecheck falla tras un PR | Mismo chat: *"Corrige los errores de typecheck sin cambiar el alcance del PR #X"* |
| PR #4 muy grande, se corta | Divide: PR #4a solo Login+AuthContext, PR #4b Inbox+Chat (pide en chat nuevo) |
| Deploy nginx (PR #5) | Puedes ejecutarlo tú en VPS siguiendo el prompt, o Agent + modelo Composer |

### Nombres en la UI de Cursor (referencia)

- **Agent** = modo que escribe código y ejecuta comandos (obligatorio).
- **Composer** = modelo rápido, bueno para deploy/scripts.
- **Claude Sonnet / Opus** = mejor razonamiento en refactors y auth.
- **GPT-5 Codex** = muy bueno en TypeScript backend + APIs.

---

## Arquitectura de dominios

| Dominio | Función | Quién accede |
|---------|---------|--------------|
| `chatbot.uprit.edu.pe` | Webhook Meta (`/webhook`), health, API interna | Meta, backend |
| `admision.uprit.edu.pe` | Panel React de asesores + proxy `/api` → backend | Asesores comerciales |

```mermaid
flowchart LR
    subgraph admision [admision.uprit.edu.pe]
        UI[React admin SPA]
    end
    subgraph chatbot [chatbot.uprit.edu.pe]
        WH[/webhook]
        API[/api/v1]
    end
    UI -->|HTTPS /api/v1/*| API
    Meta[Meta WhatsApp] --> WH
    API --> WA[WhatsApp lead]
```

**Nginx (VPS):**
- `admision.uprit.edu.pe` → sirve `admin/dist` + `proxy_pass /api` → `localhost:8090`
- `chatbot.uprit.edu.pe` → solo `/webhook` y `/health` (sin panel público)

**Seguridad:**
- Cada agente tiene `username` + `password` (hash bcrypt en MongoDB).
- Login devuelve **JWT** con `agentId` (sin confiar en headers manipulables).
- Todas las APIs de inbox/mensajes filtran por `assignedAgentId === agentId del JWT`.
- Un agente **nunca** ve chats de otro agente (403 si intenta abrir conversationId ajeno).

---

## Prompt 0 — Contexto rápido (opcional)

```
Estoy en el repo chatbot-uprit (backend WhatsApp + DeepSeek + MongoDB).

Arquitectura:
- src/domain/, src/application/, src/infrastructure/
- Entry: src/main.ts
- Webhook: POST /webhook → HandleIncomingMessageUseCase

Handoff actual (incompleto):
- HANDOFF_TRIGGER → Sí/No → notifica agente por WhatsApp personal
- Al confirmar: conversation.close() ← BUG
- No hay panel ni login de agentes

Dominios objetivo:
- chatbot.uprit.edu.pe → webhook + API
- admision.uprit.edu.pe → panel React asesores (admin/)

Auth objetivo:
- Cada agente: username + password → JWT
- Solo ve chats donde assignedAgentId === su agentId

Colecciones: conversations, messages, funnel_users, funnel_messages, agents

Lee docs/handoff-pr-prompts.md y ejecuta el PR que te indique.
```

---

## PR #1 — Estado human handoff + silenciar bot

```
Implementa PR #1: Human Handoff state — silenciar bot tras handoff confirmado.

## Contexto
Repo: chatbot-uprit. Clean Architecture. El handoff actual cierra la conversación al confirmar (`.close()`), lo que hace que el bot vuelva a responder en mensajes nuevos.

## Objetivo
Cuando el usuario confirma handoff (Sí), la conversación pasa a `mode: 'human'`, queda `status: 'active'`, se asigna un agente, y los mensajes entrantes del lead ya NO llaman a DeepSeek ni generan respuesta automática.

## Cambios requeridos

### 1. Modelo MongoDB `conversations`
Archivo: src/infrastructure/database/mongodb/models/conversation.model.ts

Agregar campos:
- mode: 'bot' | 'human' (default 'bot', index)
- assignedAgentId: string | null (default null, index)
- handoffAt: Date | null
- handoffBy: 'user' | 'bot' | 'agent' | 'system' | null
- lastUserMessageAt: Date | null
- lastAgentMessageAt: Date | null
- unreadCountAgent: number (default 0)

### 2. Entidad dominio `Conversation`
Archivo: src/domain/entities/conversation.entity.ts

- Tipos ConversationMode, HandoffBy y campos nuevos
- Métodos: withHumanHandoff, withBotMode, incrementUnread, resetUnread, isHumanMode, isBotMode

### 3. Repositorio conversation.mongo-repository.ts
- Persistir/leer campos nuevos; defaults para docs viejos (mode='bot')

### 4. HandleIncomingMessageUseCase
- Si conversation?.isHumanMode() → handleHumanModeInbound() y return (sin AI, sin respuesta)
- Handoff confirmado: NO .close(); usar withHumanHandoff(agent.id, 'user')
- Loop handoff: igual, withHumanHandoff(agent.id, 'bot')
- Mensaje transición al lead con nombre del agente
- funnel_users.assignedAgent = agent.id (UUID, no whatsapp)
- Notificación al agente: incluir link https://admision.uprit.edu.pe/inbox (env ADMISION_PANEL_URL)

### 5. .env.example
ADMISION_PANEL_URL=https://admision.uprit.edu.pe
HANDOFF_TRANSITION_MESSAGE=Te comunico con {agentName}, asesor de admisiones de la UPRIT. En un momento te atiende.

### 6. Script migración (opcional)
deploy/migrate-conversation-handoff-fields.mjs

## Criterios de aceptación
1. Handoff Sí → mensaje transición + mode=human + assignedAgentId
2. Lead escribe después → bot NO responde
3. Handoff No → bot sigue
4. npm run typecheck pasa

Implementa y resume archivos tocados.
```

---

## PR #2 — Login agentes (usuario/contraseña) + JWT

```
Implementa PR #2: Autenticación de agentes — username/password, JWT, cada agente solo accede a su identidad.

## Prerequisito
PR #1 implementado.

## Objetivo
Cada asesor comercial tiene usuario y contraseña. Login devuelve JWT. Todas las APIs del panel (PR #3) usarán este JWT — NO API keys compartidas ni header X-Agent-Id manipulable.

## Cambios requeridos

### 1. Extender modelo `agents`
Archivo: src/infrastructure/database/mongodb/models/agent.model.ts

Agregar campos:
- username: string (unique, lowercase, index) — ej. "norman.lazaro"
- passwordHash: string — bcrypt, nunca plaintext
- lastLoginAt: Date | null

Quitar obligatoriedad de usar whatsapp solo para login; whatsapp sigue para alertas opcionales.

### 2. Entidad dominio Agent
Archivo: src/domain/entities/agent.entity.ts
- Agregar username (readonly)
- NO exponer passwordHash en toProps público si no hace falta

### 3. AgentRepository
Archivo: src/domain/repositories/agent.repository.ts + agent.mongo-repository.ts
- findByUsername(username: string): Promise<Agent | null>
- updatePasswordHash(agentId, hash): Promise<void>
- updateLastLogin(agentId): Promise<void>

### 4. Dependencia
Agregar: bcrypt (o bcryptjs) + jsonwebtoken
Agregar tipos @types/bcryptjs @types/jsonwebtoken si aplica

### 5. Use cases auth
Crear src/application/use-cases/agent-auth/

a) LoginAgentUseCase
Input: { username, password }
- Buscar agent por username
- Validar status === 'Active'
- bcrypt.compare(password, passwordHash)
- Generar JWT: payload { sub: agentId, username, name }, exp 8h (configurable)
- updateLastLogin
- Return { token, agent: { id, name, username, email } }

b) GetAgentProfileUseCase (opcional)
- Desde JWT sub → perfil agente

### 6. JWT middleware
Crear: src/infrastructure/http/middlewares/authenticate-agent-jwt.middleware.ts
- Header: Authorization: Bearer <jwt>
- Verificar con JWT_SECRET (env)
- Adjuntar req.agent = { id, username, name } (typed en Express)
- 401 si inválido/expirado

### 7. Routes auth (públicas, sin JWT)
Crear: src/infrastructure/http/routes/auth.routes.ts
POST /api/v1/auth/login
Body: { "username": "norman.lazaro", "password": "..." }
Response 200: { token, agent: { id, name, username } }
Response 401: credenciales inválidas

POST /api/v1/auth/logout — opcional MVP (client-side discard token)

### 8. Seeder / script crear contraseñas
Crear: deploy/seed-agent-passwords.mjs
- Para cada agent en MongoDB sin passwordHash, set username derivado del email o name + password temporal
- Imprimir credenciales temporales (solo dev)
- Documentar: primer login debe cambiar password (fase 2) o admin resetea

### 9. .env.example
JWT_SECRET=genera-un-secreto-largo-aleatorio
JWT_EXPIRES_IN=8h
ADMISION_CORS_ORIGIN=https://admision.uprit.edu.pe

### 10. CORS en server.ts
- Permitir origin ADMISION_CORS_ORIGIN (y http://localhost:5173 en dev)
- Headers: Authorization, Content-Type
- credentials: true si usas cookies (JWT en header es suficiente para MVP)

## Reglas de seguridad
- Nunca loguear passwords
- passwordHash mínimo bcrypt rounds 10
- Rate limit en POST /auth/login (usar RATE_LIMIT_* existente o 5 req/min por IP)

## Criterios de aceptación
1. POST /auth/login con agent válido → JWT
2. Credenciales wrong → 401
3. Agent Inactive → 401
4. JWT middleware decodifica sub = agentId
5. typecheck pasa

## Prueba curl
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"norman.lazaro","password":"TempPass123"}'

Implementa completo. NO implementar inbox aún (PR #3).
```

---

## PR #3 — API inbox + enviar mensajes (solo chats del agente autenticado)

```
Implementa PR #3: Agent Inbox API + Send Message — filtrado estricto por agentId del JWT.

## Prerequisitos
PR #1 (mode=human) y PR #2 (JWT auth) implementados.

## Objetivo
APIs REST protegidas con JWT. El agentId SIEMPRE sale del token (req.agent.id), nunca del body/query. Un agente solo lista y opera conversaciones donde assignedAgentId === req.agent.id.

## Cambios requeridos

### 1. messages role agent
- message.model.ts + message.entity.ts → role incluye 'agent', isFromAgent()

### 2. funnel_messages
- saveAgentMessage({ funnelUserId, text, agentId }) en funnel-message.mongo-repository.ts

### 3. ConversationRepository
- findHumanByAgentId(agentId, { limit, offset })
- countHumanByAgentId(agentId)
Query: { mode:'human', status:'active', assignedAgentId: agentId }

### 4. Helper autorización (obligatorio en todos los use cases)
Crear: src/application/services/conversation-access.service.ts
assertAgentOwnsConversation(conversation, agentId): void → throws ForbiddenError si assignedAgentId !== agentId

### 5. Use cases

a) SendAgentMessageUseCase
Input: { conversationId, agentId, content } — agentId desde JWT en controller
- assertAgentOwnsConversation
- mode === 'human', ventana 24h, send Meta, persist agent message

b) ListAgentInboxUseCase
Input: { agentId, limit, offset }
- SOLO findHumanByAgentId(agentId) — imposible ver chats ajenos

c) GetConversationHistoryUseCase
- assertAgentOwnsConversation antes de devolver historial

d) MarkConversationReadUseCase
e) ReturnConversationToBotUseCase
f) CloseConversationUseCase (opcional)

### 6. Routes (todas con authenticate-agent-jwt.middleware)
src/infrastructure/http/routes/agent-inbox.routes.ts

GET  /api/v1/inbox
GET  /api/v1/conversations/:id
GET  /api/v1/conversations/:id/messages
POST /api/v1/conversations/:id/messages     Body: { content }
POST /api/v1/conversations/:id/read
POST /api/v1/conversations/:id/return-to-bot
POST /api/v1/conversations/:id/close

Controller: extraer req.agent.id — NUNCA aceptar agentId del cliente

### 7. Wire main.ts

## Criterios de aceptación
1. Agente A login → inbox solo sus chats
2. Agente A intenta GET conversation de agente B → 403
3. POST message en chat propio → lead recibe WhatsApp
4. POST message en chat ajeno → 403
5. typecheck pasa

## Prueba
TOKEN=$(curl -s -X POST .../auth/login ... | jq -r .token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/inbox

Implementa y documenta endpoints.
```

---

## PR #4 — Panel React en admin/ (login usuario/contraseña)

```
Implementa PR #4: Panel React para asesores — login con username/password, solo inbox propio.

## Prerequisitos
PR #1, #2, #3 implementados.

## Objetivo
SPA React en carpeta admin/. Login real (no API key). Tras login guarda JWT. Todas las llamadas usan Authorization Bearer. UI en español, mobile-friendly.

## Estructura

admin/
├── package.json       (Vite + React 18 + TypeScript + react-router-dom)
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/client.ts
│   ├── auth/AuthContext.tsx
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── InboxPage.tsx
│   │   └── ChatPage.tsx
│   ├── components/ ...
│   └── hooks/useInbox.ts, useChatMessages.ts

## LoginPage
- Campos: Usuario, Contraseña
- POST /api/v1/auth/login → guardar token en localStorage (uprit_agent_token)
- AuthContext provee agent + token + logout
- Rutas protegidas: sin token → redirect /login
- NO pedir Agent ID ni API Key al usuario

## API client (admin/src/api/client.ts)
- BASE: import.meta.env.VITE_API_BASE_URL || '' (en prod: '' porque same-origin vía nginx /api)
- Headers: Authorization: Bearer ${token}
- 401 → logout + redirect login

## InboxPage
- GET /api/v1/inbox — solo chats del agente logueado (backend ya filtra)
- Polling 5s
- Badge unread

## ChatPage
- GET /api/v1/conversations/:id/messages
- POST messages, POST read, POST return-to-bot
- Validar 403 → mensaje "Este chat no está asignado a ti"

## Dev
admin/.env.development:
VITE_API_BASE_URL=http://localhost:3000

vite.config.ts proxy:
'/api' → 'http://localhost:3000'

npm run admin:dev → http://localhost:5173

## Producción — NO servir en /admin del backend
El panel se despliega en admision.uprit.edu.pe vía nginx (PR #5).
Opcional: express.static solo para dev local integrado.

## Scripts raíz
"admin:dev", "admin:build", "build:all"

## Criterios de aceptación
1. Login norman / password → entra al inbox
2. Solo ve sus chats asignados
3. Responde → lead recibe WhatsApp
4. Logout limpia token
5. Otro agente con otro login ve otro inbox

Implementa admin/ completo + admin/README.md
```

---

## PR #5 — Nginx + dominio admision.uprit.edu.pe

```
Implementa PR #5: Deploy panel en subdominio admision.uprit.edu.pe separado de chatbot.uprit.edu.pe.

## Prerequisitos
PR #1-#4 implementados. admin/dist buildeado.

## Objetivo
- admision.uprit.edu.pe → SPA React + proxy /api → backend
- chatbot.uprit.edu.pe → webhook Meta + health (sin panel expuesto)
- HTTPS Let's Encrypt
- CORS configurado

## Archivos a crear

### 1. deploy/nginx/admision.uprit.edu.pe.conf
server {
  listen 443 ssl http2;
  server_name admision.uprit.edu.pe;

  root /opt/chatbot-uprit/admin/dist;
  index index.html;

  # SPA fallback
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API → backend chatbot
  location /api/ {
    proxy_pass http://127.0.0.1:8090/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

### 2. deploy/nginx/chatbot.uprit.edu.pe.conf
- /webhook → proxy backend :8090
- /health → proxy backend
- NO servir admin aquí

### 3. Actualizar Dockerfile (multi-stage)
- Stage admin-build: build admin/
- Stage production: COPY admin/dist (para nginx en host, o servir desde volumen)

### 4. docker-compose.yml (opcional servicio nginx)
O documentar nginx en host Ubuntu (como ya tienen en VPS).

### 5. .env producción
ADMISION_CORS_ORIGIN=https://admision.uprit.edu.pe
ADMISION_PANEL_URL=https://admision.uprit.edu.pe
JWT_SECRET=<secreto-produccion>

### 6. deploy/setup-admision-domain.sh
- Copiar nginx conf
- certbot --nginx -d admision.uprit.edu.pe
- npm run build:all
- reload nginx

### 7. DNS (documentar)
Registro A admision.uprit.edu.pe → IP del VPS (misma que chatbot)

## Criterios de aceptación
1. https://admision.uprit.edu.pe carga login React
2. Login funciona (API vía /api proxy same-origin)
3. https://chatbot.uprit.edu.pe/webhook sigue operativo
4. No hay errores CORS en prod (same-origin en admision)
5. Documentar en deploy/ADMISION-DEPLOY.md

Implementa configs nginx + script deploy + documentación. NO commitear secrets.
```

---

## Prompt final — E2E + credenciales agentes

```
Verifica flujo completo Human Handoff con dominio admision.uprit.edu.pe y auth por agente.

1. npm run typecheck + npm run build:all
2. seed-agent-passwords.mjs para agentes de prueba
3. Crear deploy/test-handoff-e2e.md con checklist:

   [ ] Lead WhatsApp → handoff Sí → mode=human, assignedAgentId=X
   [ ] Bot no responde más al lead
   [ ] Agente X login en admision.uprit.edu.pe → ve el chat
   [ ] Agente Y login → NO ve el chat de X (inbox vacío o 403 al forzar URL)
   [ ] Agente X responde → lead recibe en mismo hilo UPRIT
   [ ] Devolver al bot → Angela responde de nuevo
   [ ] chatbot.uprit.edu.pe/webhook sigue OK

4. Corregir bugs de integración
5. Resumen deploy VPS /opt/chatbot-uprit

NO commitear .env ni passwords.
```

---

## Orden de ejecución

| Sesión | Prompt | Modo | Modelo | Resultado |
|--------|--------|------|--------|-----------|
| 1 | PR #1 | Agent | Claude Sonnet / GPT-5 Codex | Bot se calla tras handoff |
| 2 | PR #2 | Agent | Claude Sonnet / GPT-5 Codex | Login usuario/contraseña + JWT |
| 3 | PR #3 | Agent | GPT-5 Codex / Claude Sonnet | API inbox/mensajes filtrada por agente |
| 4 | PR #4 | Agent | Claude Sonnet / GPT-5 Codex | Panel React con login real |
| 5 | PR #5 | Agent | Composer / GPT-5 Codex | Dominio admision.uprit.edu.pe |
| 6 | Prompt final | Agent | Composer | E2E + deploy |

---

## Resumen: usuario/contraseña y aislamiento

| Requisito | Cómo se cumple |
|-----------|----------------|
| Dominio propio | `admision.uprit.edu.pe` (nginx sirve React + proxy /api) |
| Usuario/contraseña | `agents.username` + `agents.passwordHash`, POST `/api/v1/auth/login` |
| Solo sus chats | JWT contiene `agentId`; inbox query `assignedAgentId = agentId`; 403 si no es suyo |
| Mismo hilo WhatsApp | Backend envía vía MetaWhatsAppAdapter al lead (sin cambios) |

---

## Notas

- Cada prompt es autocontenido; si pierdes contexto, pega **Prompt 0** primero.
- Tras cada PR: `git commit` antes del siguiente.
- Passwords: bcrypt, nunca en logs. Rotar JWT_SECRET en producción.
- El panel UPRIT admin externo (si existe) es independiente; este es solo para asesores de admisión WhatsApp.
