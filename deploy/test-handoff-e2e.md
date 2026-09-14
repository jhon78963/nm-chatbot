# E2E — Human Handoff (checklist)

Verificación del flujo completo: WhatsApp lead → handoff humano → panel asesores → respuesta → devolver al bot.

**Rama:** `human-handoff`  
**Dominios:** `chatbot.uprit.edu.pe` (webhook) · `admision.uprit.edu.pe` (panel)

---

## Pre-requisitos (build local)

```bash
npm run typecheck    # ✅ debe pasar
npm run build:all    # genera dist/ + admin/dist/
```

**Resultado local (última verificación):** typecheck y build:all OK.

---

## Pre-requisitos (VPS `/opt/chatbot-uprit`)

```bash
cd /opt/chatbot-uprit
git pull origin human-handoff

# Variables en .env (NO commitear):
# JWT_SECRET, ADMISION_PANEL_URL, ADMISION_CORS_ORIGIN, API_PORT=8090

npm run build:all
docker compose up -d --build app
bash deploy/setup-admision-domain.sh   # solo primera vez o si cambió nginx

# Credenciales asesores (imprime passwords temporales — NO commitear salida):
npm run seed:agents
```

---

## Checklist funcional

Marca cada ítem tras probarlo en **staging/producción**:

- [ ] **Handoff Sí** — Lead en WhatsApp confirma handoff → MongoDB: `conversations.mode=human`, `assignedAgentId=<uuid>`, `status=active`
- [ ] **Bot silenciado** — Lead escribe de nuevo → Angela NO responde (sin llamada DeepSeek)
- [ ] **Login agente X** — `https://admision.uprit.edu.pe/login` con usuario/contraseña → JWT en localStorage (`uprit_agent_token`)
- [ ] **Inbox agente X** — Ve el chat handoff asignado a él (badge unread si aplica)
- [ ] **Aislamiento agente Y** — Otro asesor login → inbox vacío; forzar URL `/chat/<id-de-X>` → 403 "Este chat no está asignado a ti"
- [ ] **Responder** — Agente X envía mensaje → lead recibe en el mismo hilo WhatsApp UPRIT
- [ ] **Devolver al bot** — POST return-to-bot → `mode=bot`; lead escribe → Angela responde de nuevo
- [ ] **Webhook Meta** — `GET https://chatbot.uprit.edu.pe/webhook?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=test` → 200 con challenge
- [ ] **Health** — `curl https://chatbot.uprit.edu.pe/health` → `{"status":"ok",...}`
- [ ] **Sin CORS** — Consola del navegador en admision sin errores CORS (same-origin `/api`)

---

## Comandos de verificación rápida

### Login API

```bash
curl -s -X POST https://admision.uprit.edu.pe/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"TU_USUARIO","password":"TU_PASSWORD"}' | jq .
```

### Inbox (con token)

```bash
TOKEN="<jwt>"
curl -s -H "Authorization: Bearer $TOKEN" \
  https://admision.uprit.edu.pe/api/v1/inbox | jq .
```

### Enviar mensaje

```bash
curl -s -X POST "https://admision.uprit.edu.pe/api/v1/conversations/CONV_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hola, soy tu asesor UPRIT"}' | jq .
```

### Inspeccionar conversación en MongoDB

```bash
node --env-file=.env deploy/list-conversations.mjs
# o Compass: conversations → filtrar mode=human, assignedAgentId
```

---

## Desarrollo local (sin VPS)

| Terminal 1 | Terminal 2 |
|------------|------------|
| `npm run dev` | `npm run admin:dev` |
| Backend `:3000` | Panel `:5173` (proxy `/api`) |

1. `npm run seed:agents` (requiere MongoDB accesible en `MONGODB_URI`)
2. Login en `http://localhost:5173/login`
3. Simular handoff: confirmar Sí en WhatsApp sandbox o insertar conversación `mode=human` en Mongo

---

## Resumen deploy VPS

| Componente | Ubicación / puerto |
|------------|-------------------|
| Código | `/opt/chatbot-uprit` |
| Backend Docker | `127.0.0.1:8090` (`API_PORT` en `.env`) |
| Panel React | `/opt/chatbot-uprit/admin/dist` |
| Nginx chatbot | `/etc/nginx/sites-enabled/chatbot.uprit.edu.pe.conf` |
| Nginx admision | `/etc/nginx/sites-enabled/admision.uprit.edu.pe.conf` |
| SSL | Let's Encrypt (`certbot --nginx`) |
| Logs app | `docker compose logs -f app` |

### Deploy rutinario

```bash
cd /opt/chatbot-uprit
git pull --ff-only
npm run build:all
docker compose up -d --build app
sudo nginx -t && sudo systemctl reload nginx
```

### Documentación relacionada

- `deploy/ADMISION-DEPLOY.md` — setup admision.uprit.edu.pe
- `deploy/INFRA-CHECKLIST.md` — DNS, Cloudflare, security groups
- `docs/handoff-pr-prompts.md` — prompts PR #1–#5

---

## Notas

- **NO commitear** `.env`, salida de `seed:agents`, ni passwords.
- Rotar `JWT_SECRET` si se expuso en logs.
- Ventana WhatsApp 24h: si el lead no escribió en 24h, el agente no puede enviar hasta que el lead escriba de nuevo.
