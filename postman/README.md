# Postman — Chatbot UPRIT

Producción: **https://chatbot.uprit.edu.pe**

## Importar

1. `postman/chatbot-uprit.postman_collection.json`
2. Environment (elige uno):
   - **Recomendado:** generar desde el VPS (valores reales, no se commitea):
     ```bash
     ./vps/connect.sh "bash /opt/chatbot-uprit/deploy/generate-postman-env.sh" > postman/chatbot-uprit.postman_environment.local.json
     ```
     Importa `chatbot-uprit.postman_environment.local.json` en Postman.
   - **Plantilla vacía:** `postman/chatbot-uprit.postman_environment.json` (rellena a mano)

Activa el environment en la esquina superior derecha de Postman.

## Secrets — NO son lo mismo

| Postman | `.env` del VPS | Qué es | Dónde obtenerlo en Meta |
| ------- | -------------- | ------ | ------------------------ |
| `meta_webhook_verify_token` | `META_WEBHOOK_VERIFY_TOKEN` | Token de verificación (GET) | WhatsApp → Webhook → **Verify token** (lo defines tú) |
| `webhook_secret` | `WEBHOOK_SECRET` | **App Secret** (POST, firma HMAC) | App → Configuración → Básica → **Clave secreta** (32 hex) |

```
GET  /webhook  →  meta_webhook_verify_token
POST /webhook  →  webhook_secret (= App Secret)
```

## Requests

| Request | Resultado esperado |
| ------- | ------------------ |
| GET /health | `200` `{ "status": "ok" }` |
| GET /webhook — Meta verification | `200` + body = `test123` |
| GET /webhook — Invalid token | `403` |
| POST /webhook — Invalid signature | `403` |
| POST /webhook — Text message | `200` + respuesta en WhatsApp |
| POST /webhook — Image message | `200` + auto-reply bot (modo bot) o cola agente (modo human) |
| POST /webhook — Document message | `200` + auto-reply bot (modo bot) o cola agente (modo human) |
| POST /webhook — Audio message (A4) | `200` + media guardada; auto-reply bot o inbox human |
| POST /webhook — Video message (A5) | `200` + media guardada; auto-reply bot o inbox human |
| POST /conversations/:id/messages — Send audio | `201` + lead recibe nota de voz (multipart) |
| POST /conversations/:id/messages — Send video | `201` + lead recibe video MP4 (multipart) |
| POST /webhook — Status update | `200` (evento ignorado) |

## Orden de prueba E2E (Paq 1–4)

Ejecutar en este orden. Marca ítems en `docs/WA-FEATURES-E2E.md`.

### Fase 0 — Smoke (Postman)

| # | Request | Esperado |
|---|---------|----------|
| 1 | GET /health | `200` |
| 2 | GET /webhook — Meta verification | `200` + challenge |
| 3 | GET /webhook — Invalid token | `403` |
| 4 | POST /webhook — Invalid signature | `403` |

### Fase 1 — Auth + inbox (curl o panel)

```bash
# Login agente → guardar token
curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"TU_USUARIO","password":"TU_PASSWORD"}'
# → agent_token en Postman environment

curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/inbox
```

Panel: `https://admision.uprit.edu.pe/login` → inbox propio.

### Fase 2 — Paq 1 (media + filtros)

| # | Request / acción | E2E doc |
|---|------------------|---------|
| 5 | POST /webhook — Text message | — |
| 6 | POST /webhook — Image (payload M2) | Paq1 imagen |
| 7 | POST /webhook — Document PDF (payload M2) | — |
| 8 | POST multipart PDF al lead (curl M3) | Paq1 PDF outbound |
| 9 | Panel: filtros no leídos / sin responder / buscar | Paq1 filtros |
| 10 | Panel: banner 24h con ventana cerrada | Paq1 banner |

### Fase 3 — Paq 2 (organización)

Probar en panel: label, pin, archivar, nota interna, reassign, separadores Hoy/Ayer.

### Fase 4 — Paq 3 (interactivo)

| # | Request / acción | E2E doc |
|---|------------------|---------|
| 11 | POST /webhook — Text `menu` (lead nuevo) | Menú list |
| 12 | POST /webhook — Inbound interactive button_reply | — |
| 13 | POST /webhook — Inbound location (A7) | Ubicación |
| 14 | Lead pide `folleto` / `pdf` (bot mode) | Brochure PDF |

Requests B1–B3 (outbound interactive): collection items `interactive-buttons`, `interactive-list`, `cta-url`.

### Fase 5 — Paq 4 (audio / video)

| # | Request / acción | E2E doc |
|---|------------------|---------|
| 15 | POST /webhook — Audio message (A4) | Audio roundtrip |
| 16 | POST /webhook — Video message (A5) | — |
| 17 | POST /conversations/:id/messages — Send audio (multipart) | Audio roundtrip |
| 18 | POST /conversations/:id/messages — Send video (multipart) | Video roundtrip |
| 19 | Panel: composer adjunta audio/video | Paq4 roundtrip |

### Fase 6 — Cierre

| # | Request | Esperado |
|---|---------|----------|
| 20 | POST /webhook — Status update | `200` ignorado |

## Orden rápido Postman (solo requests de colección)

1. GET /health
2. GET /webhook — Meta verification
3. POST /webhook — Invalid signature
4. POST /webhook — Text message (número real en `test_wa_id`)
5. POST /webhook — Image message (payload sample abajo)
6. POST /webhook — Document message (payload sample abajo)
7. POST /webhook — Audio message (A4)
8. POST /webhook — Video message (A5)
9. POST /conversations/:id/messages — Send audio (multipart, JWT)
10. POST /conversations/:id/messages — Send video (multipart, JWT)
11. POST /webhook — Inbound interactive button_reply
12. POST /webhook — Inbound location (A7)
13. POST /conversations/:id/interactive-buttons — B1
14. POST /conversations/:id/interactive-list — B2
15. POST /conversations/:id/cta-url — B3
16. POST /webhook — Status update

## Payload samples — inbound media (M2)

### Image

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550000000",
          "phone_number_id": "1234567890"
        },
        "contacts": [{
          "profile": { "name": "Lead Test" },
          "wa_id": "51999999999"
        }],
        "messages": [{
          "from": "51999999999",
          "id": "wamid.INBOUND_IMAGE_ID",
          "timestamp": "1710000000",
          "type": "image",
          "image": {
            "caption": "Foto de mi DNI",
            "mime_type": "image/jpeg",
            "sha256": "abc123",
            "id": "META_MEDIA_ID_IMAGE"
          }
        }]
      }
    }]
  }]
}
```

### Document (PDF)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550000000",
          "phone_number_id": "1234567890"
        },
        "contacts": [{
          "profile": { "name": "Lead Test" },
          "wa_id": "51999999999"
        }],
        "messages": [{
          "from": "51999999999",
          "id": "wamid.INBOUND_DOC_ID",
          "timestamp": "1710000001",
          "type": "document",
          "document": {
            "caption": "Constancia de estudios",
            "filename": "constancia.pdf",
            "mime_type": "application/pdf",
            "sha256": "def456",
            "id": "META_MEDIA_ID_DOC"
          }
        }]
      }
    }]
  }]
}
```

**Comportamiento esperado (modo bot):** webhook `200`, media descargada de Meta y guardada localmente, auto-reply `AUTO_REPLY_UNSUPPORTED_MEDIA`, sin llamada a DeepSeek.

**Comportamiento esperado (modo human):** webhook `200`, media guardada, mensaje en inbox del agente asignado, sin auto-reply del bot.

## Outbound agent media (M3) — POST multipart

Requiere JWT de agente (`Authorization: Bearer {{agent_token}}`) y conversación en **modo human** con ventana 24h abierta.

### Enviar imagen al lead

```bash
curl -X POST "http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer AGENT_JWT" \
  -F "content=Adjunto tu brochure" \
  -F "file=@/ruta/a/foto.jpg;type=image/jpeg"
```

### Enviar PDF al lead

```bash
curl -X POST "http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer AGENT_JWT" \
  -F "content=Constancia adjunta" \
  -F "file=@/ruta/a/constancia.pdf;type=application/pdf"
```

### Solo texto (JSON, backward compatible)

```bash
curl -X POST "http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer AGENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hola, ¿en qué puedo ayudarte?"}'
```

**MIME permitidos:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, audio (`ogg`, `mpeg`, `mp4`, `aac`, `amr`, `wav`, `webm`), video (`mp4`, `3gpp`) — máximo 16 MB (audio/video), 5 MB imágenes.

**Respuesta 201:** `{ "messageId": "wamid...", "status": "sent", "contentType": "image", "mediaUrl": "/media/..." }`

## Payload samples — inbound audio/video (M11)

### Audio (nota de voz)

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550000000",
          "phone_number_id": "1234567890"
        },
        "contacts": [{
          "profile": { "name": "Lead Test" },
          "wa_id": "51999999999"
        }],
        "messages": [{
          "from": "51999999999",
          "id": "wamid.INBOUND_AUDIO_ID",
          "timestamp": "1710000002",
          "type": "audio",
          "audio": {
            "mime_type": "audio/ogg; codecs=opus",
            "sha256": "abc789",
            "id": "META_MEDIA_ID_AUDIO",
            "voice": true
          }
        }]
      }
    }]
  }]
}
```

### Video

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550000000",
          "phone_number_id": "1234567890"
        },
        "contacts": [{
          "profile": { "name": "Lead Test" },
          "wa_id": "51999999999"
        }],
        "messages": [{
          "from": "51999999999",
          "id": "wamid.INBOUND_VIDEO_ID",
          "timestamp": "1710000003",
          "type": "video",
          "video": {
            "caption": "Video de consulta",
            "mime_type": "video/mp4",
            "sha256": "ghi012",
            "id": "META_MEDIA_ID_VIDEO"
          }
        }]
      }
    }]
  }]
}
```

## Outbound agent audio/video (M11) — POST multipart

Requiere JWT y conversación en modo human con ventana 24h abierta.

### Enviar audio al lead

```bash
curl -X POST "http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer AGENT_JWT" \
  -F "content=Te envío un audio explicativo" \
  -F "file=@/ruta/a/nota.ogg;type=audio/ogg"
```

### Enviar video al lead

```bash
curl -X POST "http://localhost:3000/api/v1/conversations/CONVERSATION_ID/messages" \
  -H "Authorization: Bearer AGENT_JWT" \
  -F "content=Video informativo" \
  -F "file=@/ruta/a/clip.mp4;type=video/mp4"
```

## Deploy multimedia

Ver `docs/WA-FEATURES-DEPLOY.md` — proxy Apache `/media`, backup volumen `uploads-data`.

## Checklist E2E completo

Ver `docs/WA-FEATURES-E2E.md` — 14 ítems Paq 1–4 + orden sugerido + variables `.env` VPS.

## Sincronizar tras cambiar `.env` en el VPS

```bash
# Regenerar environment de Postman
./vps/connect.sh "bash /opt/chatbot-uprit/deploy/generate-postman-env.sh" > postman/chatbot-uprit.postman_environment.local.json

# Validar secrets en el servidor
./vps/connect.sh "cd /opt/chatbot-uprit && bash deploy/audit-meta-secrets.sh && docker compose up -d app"
```

## Grafana

**https://grafana.uprit.edu.pe** → Explore → Loki:

```logql
{container="chatbot-uprit-app"} |= "WhatsApp"
```
