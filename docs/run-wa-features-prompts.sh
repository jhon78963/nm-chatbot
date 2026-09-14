#!/usr/bin/env bash
#
# run-wa-features-prompts.sh — Prompts para Paquetes 1–4 (multimedia + panel + bot + avanzado)
#
# Uso:
#   ./docs/run-wa-features-prompts.sh           # lista sesiones
#   ./docs/run-wa-features-prompts.sh M0        # imprime prompt (pegar en Cursor Agent)
#
# Windows — copiar al portapapeles:
#   .\docs\copy-wa-prompt.ps1 M0
#   .\docs\copy-wa-prompt.ps1 list
#
# Git Bash — copiar al portapapeles:
#   ./docs/run-wa-features-prompts.sh M1 2>/dev/null | clip
#
# Reglas Cursor:
#   - 1 sesión = 1 chat nuevo en Agent mode
#   - Composer 2.5 Fast → M2,M3,M4,M6,M9,M12,M-FINAL (código acotado, paths claros)
#   - Sonnet 4.6 → M1,M5,M7,M8,M10,M11 (arquitectura, UI grande, Meta API nueva)
#   - Tras cada sesión: npm run typecheck && npm run build:all → commit → chat nuevo
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

declare -A META=(
  [M0]="Contexto base | Composer | pegar antes de cualquier PR"
  [M1]="Paq1 — Media domain + Meta Media API + storage | Sonnet"
  [M2]="Paq1 — Inbound image/PDF webhook | Composer"
  [M3]="Paq1 — Outbound image/PDF + agent API | Composer"
  [M4]="Paq1 — Filtros inbox + ventana 24h API | Composer"
  [M5]="Paq1 — Panel: adjuntar, media UI, filtros, buscar, banner 24h | Sonnet"
  [M6]="Paq2 — Backend: labels, pin, archive, snippets, notas, reassign | Sonnet"
  [M7]="Paq2 — Panel: etiquetas, pin, archivar, snippets, notas, reassign, fechas, drag-drop | Sonnet"
  [M8]="Paq3 — Interactive messages Meta (B1 B2 B3) | Sonnet"
  [M9]="Paq3 — Location A7 + brochure PDF F7 | Composer"
  [M10]="Paq3 — Bot menú interactivo F8 | Sonnet"
  [M11]="Paq4 — Audio/video backend A4 A5 | Sonnet"
  [M12]="Paq4 — Panel audio/video + Postman + checklist | Composer"
  [M-FINAL]="E2E typecheck build deploy doc | Composer"
)

usage() {
  echo "Repo: ${REPO_ROOT}"
  echo ""
  echo "Sesiones (orden: M0 → M1 … → M12 → M-FINAL):"
  echo ""
  printf "  %-10s %s\n" "ID" "Descripción"
  printf "  %-10s %s\n" "----------" "----------------------------------------"
  for id in M0 M1 M2 M3 M4 M5 M6 M7 M8 M9 M10 M11 M12 M-FINAL; do
    printf "  %-10s %s\n" "$id" "${META[$id]}"
  done
  echo ""
  echo "Ejemplo: ./docs/run-wa-features-prompts.sh M3"
}

print_prompt() {
  local id="$1"
  case "$id" in
    M0) cat <<'EOF'
Estoy en repo chatbot-uprit (Node 24, TS, Express, MongoDB Atlas, Meta WhatsApp Cloud API, Clean Architecture).

Stack:
- Backend: src/domain | src/application | src/infrastructure | src/main.ts
- Webhook: src/infrastructure/webhooks/meta/ (parser filtra SOLO type=text hoy)
- Adapter saliente: src/infrastructure/webhooks/meta/meta-whatsapp.adapter.ts (solo sendTextMessage)
- Handoff + inbox: src/application/use-cases/agent-inbox/*, admin/ React en admision.uprit.edu.pe
- Mensajes: src/domain/entities/message.entity.ts (content: string, sin media)
- Conversaciones: unreadCountAgent, lastUserMessageAt, mode bot|human, assignedAgentId
- Panel: admin/src/pages/DashboardPage.tsx (filtros admin: all|bot|assigned; agente: own|bot)
- Realtime: WebSocket admin/src/context/RealtimeContext.tsx
- Deploy: docker-compose.yml API_PORT=8090, /opt/chatbot-uprit en VPS

Reglas:
- Minimizar diff; no refactorizar fuera del PR indicado
- npm run typecheck && npm run build:all antes de terminar
- No commitear .env ni secrets
- webhookRouter montado ANTES de agentInboxRouter (fix JWT ya en main)

Ejecuta SOLO el PR que te indique a continuación. Lee docs/handoff-pr-prompts.md si necesitas contexto handoff.
EOF
    ;;
    M1) cat <<'EOF'
Implementa PR M1 — Fundación multimedia (domain + ports + Meta Media API + storage).

## Modelo Cursor: Agent + Sonnet 4.6 (arquitectura)

## Alcance Paq1: A2 A3 base — preparar recibir/enviar imagen y documento PDF

## 1. Domain — extender Message
Archivo: src/domain/entities/message.entity.ts
- Agregar tipos: MessageContentType = 'text' | 'image' | 'document' | 'audio' | 'video' | 'location' | 'interactive'
- MessageProps: contentType (default 'text'), mediaUrl?: string, mimeType?: string, fileName?: string, caption?: string
- content sigue siendo string (texto o caption/fallback); validar: text requiere content.trim(); media puede tener content='' con mediaUrl
- Actualizar Message.create() y toProps()

## 2. Port messaging
Archivo: src/application/ports/messaging-provider.port.ts
- OutboundMediaMessage { to, type: 'image'|'document'|'audio'|'video', mediaId OR link, caption?, fileName? }
- Métodos: sendTextMessage (existente), sendMediaMessage(message): Promise<OutboundMessageResult>
- NO implementar interactive/location aquí (M8/M9)

## 3. Meta Media Service (nuevo)
Archivo: src/infrastructure/webhooks/meta/meta-media.service.ts
- downloadMedia(mediaId): Promise<{ buffer, mimeType }> usando GET graph.facebook.com/{media-id} + binary
- uploadMedia(buffer, mimeType): Promise<{ mediaId }> POST /{phone-number-id}/media
- Usar META_WHATSAPP_TOKEN, phoneNumberId del adapter existente
- Límite Meta: document 100MB, image 5MB — validar y throw DomainException claro

## 4. Storage (nuevo, simple)
Archivo: src/infrastructure/storage/local-media.storage.ts
- Interface MediaStoragePort: save(buffer, { mimeType, conversationId, originalName }) → { publicPath, storageKey }
- Implementación local: MEDIA_STORAGE_PATH env (default /app/uploads en Docker)
- Servir estáticos: en server.ts montar GET /media/:storageKey SOLO con auth JWT agente O signed token efímero (elegir JWT middleware en ruta /media)
- docker-compose.yml: volume uploads-data:/app/uploads en servicio app
- .env.example: MEDIA_STORAGE_PATH, MEDIA_PUBLIC_BASE_URL=https://admision.uprit.edu.pe/media (proxy Apache /media → backend)

## 5. Mongo / repos
- message.model.ts + conversation mongo mapping: persistir contentType, mediaUrl, mimeType, fileName, caption en subdocument messages
- funnel-message.model.ts: agregar contentType + mediaUrl opcional (text sigue required — usar caption o '[image]' placeholder)

## 6. Wiring main.ts
- Instanciar MetaMediaService, LocalMediaStorage, inyectar en MetaWhatsAppAdapter

## Fuera de alcance M1
- Parser webhook inbound (M2)
- Panel UI (M5)
- Audio/video (M11)

## Criterios aceptación
- [ ] typecheck OK
- [ ] MetaWhatsAppAdapter tiene sendMediaMessage stub implementado con upload+send API Meta
- [ ] Media descargable vía ruta autenticada
- [ ] Tests manuales documentados en comentario PR (no obligatorio unit tests)

Implementa. npm run typecheck al final.
EOF
    ;;
    M2) cat <<'EOF'
Implementa PR M2 — Inbound image + document (A2 A3 recibir). Depende de M1 mergeado.

## Modelo Cursor: Agent + Composer 2.5 Fast

## Archivos clave
- src/infrastructure/webhooks/meta/meta-whatsapp.types.ts — extender MetaInboundMessage con image?, document?, caption
- src/infrastructure/webhooks/meta/whatsapp-parser.service.ts — parsear type image|document además de text
- ParsedWhatsAppInboundMessage: agregar contentType, mediaId?, mimeType?, fileName?, caption?
- src/infrastructure/webhooks/meta/whatsapp.controller.ts — dispatch igual
- src/application/use-cases/handle-incoming-message/handle-incoming-message.dto.ts — extender DTO
- handle-incoming-message.usecase.ts — human mode Y bot mode: persistir Message con media; si media, llamar MetaMediaService.downloadMedia + MediaStoragePort.save

## Comportamiento
1. Cliente envía imagen/PDF → webhook 200 → descargar de Meta → guardar local → Message role=user contentType=image|document
2. Si mode=human: notify realtime + funnel_messages (NO llamar DeepSeek)
3. Si mode=bot: NO enviar a DeepSeek el binario; responder texto fijo configurable:
   env AUTO_REPLY_UNSUPPORTED_MEDIA="Recibí tu archivo. Por favor cuéntame en texto tu consulta o espera a un asesor."
   (solo cuando contentType !== text y bot mode)
4. Log: [WhatsApp] Media received { contentType, mimeType, conversationId }

## Edge cases
- sticker/video/audio en M11 — por ahora log debug y auto-reply mismo mensaje (no crash)
- Duplicar externalMessageId idempotente como text

## Fuera de alcance
- Panel preview (M5)
- Outbound agent (M3)

## Criterios
- [ ] Postman POST /webhook con payload sample image/document (documentar JSON en postman/README.md breve)
- [ ] typecheck OK
EOF
    ;;
    M3) cat <<'EOF'
Implementa PR M3 — Outbound image/PDF (A2 A3 enviar) + API agente (D2 D3 backend).

## Modelo Cursor: Agent + Composer 2.5 Fast. Depende M1+M2.

## Backend
1. meta-whatsapp.adapter.ts — completar sendMediaMessage:
   - image: { type:'image', image:{ id } } o link
   - document: { type:'document', document:{ id, filename, caption? } }
2. send-agent-message.usecase.ts:
   - Input: { conversationId, agentId, content?, contentType?, fileBuffer?, mimeType?, fileName? }
   - Validar ventana 24h (existente)
   - Si media: uploadMedia → sendMediaMessage
   - Persist Message role=agent con media fields
3. agent-inbox.routes.ts:
   - POST /api/v1/conversations/:id/messages — soportar multipart/form-data (multer memory 10MB)
   - Fields: content (caption), file (optional)
   - Si file: infer mime → image|document
   - Mantener JSON body solo-texto backward compatible

## Seguridad
- authenticateAgentJwt + assertAgentOwnsConversation (existente)
- Validar mime whitelist: image/jpeg,image/png,image/webp, application/pdf

## Criterios
- [ ] curl multipart envía imagen al lead en human mode (documentar en postman collection)
- [ ] typecheck + build:all OK
EOF
    ;;
    M4) cat <<'EOF'
Implementa PR M4 — Filtros inbox C6 C7 C12 + API ventana 24h E10 (backend).

## Modelo Cursor: Agent + Composer 2.5 Fast

## ListAgentInboxUseCase + ConversationRepository
Archivos:
- src/application/use-cases/agent-inbox/list-agent-inbox.usecase.ts
- src/domain/repositories/conversation.repository.ts
- conversation.mongo-repository.ts

## Query params GET /api/v1/inbox
- filter=unread → unreadCountAgent > 0
- filter=unanswered → lastUserMessageAt > lastAgentMessageAt OR lastAgentMessageAt null (y lastUserMessageAt not null)
- q=519... o nombre → regex phoneNumber o join funnel_users.name (case insensitive)
- Combinable con inboxFilter existente (own|bot) y admin filters
- Retornar total correcto con mismos filtros en count*

## ConversationSummary — agregar campos E10
- csWindowOpen: boolean (lastUserMessageAt within 24h)
- csWindowExpiresAt: ISO string | null

## get-conversation-history.usecase.ts — incluir csWindowOpen en meta response

## Admin DashboardPage backend only — sin UI aún (M5)

## Índices Mongo si hace falta (unreadCountAgent, lastUserMessageAt)

## Criterios
- [ ] GET /api/v1/inbox?filter=unread retorna solo unread
- [ ] GET /api/v1/inbox?q=ericka filtra por contactName
- [ ] typecheck OK
EOF
    ;;
    M5) cat <<'EOF'
Implementa PR M5 — Panel Paq1 UI: C6 C7 C12 D2 D3 E10 + preview media (A2 A3 front).

## Modelo Cursor: Agent + Sonnet 4.6 (UI grande). Depende M2 M3 M4.

## admin/src — cambios
1. useInbox.ts — pasar filter=unread|unanswered|all, q search debounced 300ms
2. DashboardPage.tsx — botones filtro: Todos | No leídos | Sin responder | Buscar input
3. MessageBubble.tsx — si contentType image: <img src={mediaUrl} />; document: link PDF icon + fileName
4. DashboardPage chat composer:
   - Botón adjuntar (clip) → input file accept="image/*,application/pdf"
   - G9 drag-drop en área mensajes/composer
   - G10 paste image from clipboard en composer
   - Enviar multipart vía api client helper postFormData
5. Banner E10: si !csWindowOpen mostrar alerta amarilla "Ventana 24h cerrada — el lead debe escribir primero"
   - Deshabilitar enviar (texto y adjuntos) cuando cerrada
6. api/client.ts — postFormData(path, FormData)

## Estilos
- Reusar clases dash-* existentes; CSS mínimo en admin/src/index.css

## Fuera de alcance
- Etiquetas/pin (M7)
- Audio/video (M12)

## Criterios
- [ ] npm run build --prefix admin OK
- [ ] typecheck root OK
- [ ] Preview imagen en hilo; PDF abre en nueva pestaña
EOF
    ;;
    M6) cat <<'EOF'
Implementa PR M6 — Paq2 backend: C13 C14 C15 D13 D14 D15.

## Modelo Cursor: Agent + Sonnet 4.6

## Schema conversations (Mongo + domain Conversation entity)
Nuevos campos:
- labels: string[] (max 5, lowercase slug, ej. "interesado","pago-pendiente")
- pinned: boolean default false
- archivedAt: Date | null (archived = archivedAt != null; status puede quedarse active)

## Nuevos use cases + routes (agent-inbox.routes.ts)
1. PATCH /api/v1/conversations/:id/labels body { labels: string[] } — admin o assigned agent
2. POST /api/v1/conversations/:id/pin body { pinned: boolean }
3. POST /api/v1/conversations/:id/archive — set archivedAt=now; POST .../unarchive
4. GET/POST /api/v1/quick-replies — CRUD snippets globales (colección quick_replies: id, title, body, createdBy admin)
5. POST /api/v1/conversations/:id/notes body { content } — mensaje role=internal, NO enviar a WhatsApp, NO funnel outbound
6. POST /api/v1/conversations/:id/reassign body { agentId } — solo admin; actualizar assignedAgentId; mode=human; audit log

## List inbox
- Excluir archived por default; ?includeArchived=true admin only
- Orden: pinned desc, then updatedAt desc
- Filtro ?label=interesado

## Internal notes
- Message role='internal' en domain (agregar a MessageRole) o colección conversation_notes separada (prefer entity Message role internal sin externalId)

## Criterios
- [ ] Reassign cambia assignedAgentId; agente anterior pierde acceso 403
- [ ] Notes no aparecen en WhatsApp lead
- [ ] typecheck OK
EOF
    ;;
    M7) cat <<'EOF'
Implementa PR M7 — Paq2 Panel UI: C13 C14 C15 D13 D14 D15 G7 G9 G10 polish.

## Modelo Cursor: Agent + Sonnet 4.6. Depende M6 (+ M5 adjuntos ya hechos).

## UI admin/src
1. ConvItem — badge labels (chips), icon pin, archived opacity
2. Sidebar filtros labels dropdown; toggle "Archivados" admin
3. Conversation header actions: Pin, Archivar, Reasignar (modal select agente — GET /api/v1/agents activos nuevo endpoint admin-only si no existe)
4. Quick replies: popover en composer ("Respuestas rápidas") → insert text
5. Notes tab o toggle "Nota interna" en composer (estilo distinto, fondo amarillo en bubble)
6. G7 — agrupar messages por fecha en DashboardPage: separador "Hoy", "Ayer", locale es-PE
7. Confirmar G9 G10 de M5 funcionan con media

## Admin vs agent
- Reassign + quick-replies CRUD solo admin
- Agent usa quick-replies read-only

## Criterios
- [ ] build:all OK
- [ ] Flujo manual: pin chat sube arriba; archive oculta de lista default
EOF
    ;;
    M8) cat <<'EOF'
Implementa PR M8 — Paq3 Interactive messages Meta B1 B2 B3.

## Modelo Cursor: Agent + Sonnet 4.6

## meta-whatsapp.adapter.ts + port
- sendInteractiveButtons(to, { body, buttons: [{id, title}] max 3 })
- sendInteractiveList(to, { body, buttonText, sections: [{ title, rows: [{id, title, description?}] }] })
- sendCtaUrl(to, { body, displayText, url }) — type interactive cta_url (API v20)

## Parser inbound (whatsapp-parser.service.ts)
- type interactive → extraer button_reply.id / list_reply.id / nfm_reply si aplica
- Normalizar a text equivalente para HandleIncomingMessageUseCase (ej. text=buttonId o title)

## postman/chatbot-uprit.postman_collection.json — 3 requests nuevos

## Fuera de alcance F8 menú bot (M10)

## Criterios
- [ ] Envío manual buttons responde 200 Meta
- [ ] Inbound interactive parseado como text para IA
- [ ] typecheck OK
EOF
    ;;
    M9) cat <<'EOF'
Implementa PR M9 — Paq3 Location A7 + Brochure PDF F7.

## Modelo Cursor: Agent + Composer 2.5 Fast. Depende M1-M3.

## A7 Location
- Parser inbound type location → contentType location, content=lat,lng o address string, guardar en Message
- sendLocation(to, { latitude, longitude, name?, address? }) en adapter
- Env LOCATION_* en .env.example (UPRIT Trujillo sede default)

## F7 Brochure PDF bot
- Nuevo use case o helper SendProgramBrochureUseCase
- Input: programId o program slug → leer program.brochureUrl
- Si brochureUrl es PDF remoto: descargar → uploadMedia → sendDocument
- Si es URL HTML: fallback sendTextMessage con link (comportamiento actual)
- Integrar en intent-router o handle-incoming cuando usuario pide brochure explícito (detect keyword "brochure","folleto","pdf")

## Panel: mostrar location en MessageBubble (link Google Maps)

## Criterios
- [ ] Bot puede enviar PDF si program.brochureUrl apunta PDF
- [ ] Location inbound visible en panel
- [ ] typecheck OK
EOF
    ;;
    M10) cat <<'EOF'
Implementa PR M10 — Paq3 Bot menú interactivo F8 (B1 B2 B3 en flujo conversacional).

## Modelo Cursor: Agent + Sonnet 4.6. Depende M8.

## handle-incoming-message.usecase.ts + intent-router
Triggers menú principal (first message o keyword "menu","opciones","ayuda"):
- Enviar interactive list:
  Rows: "Info carreras", "Costos y admisión", "Hablar con asesor", "Ubicación sede"
- Mapear list_reply.id:
  - careers → route intent program info
  - admission → route Proceso Admision
  - handoff → trigger handoff flow existente
  - location → sendLocation sede UPRIT

Después de handoff confirmado: no enviar menú (human mode)

## Handoff Sí/No
- Opcional upgrade: reemplazar regex Sí/No por buttons Sí/No (feature flag env INTERACTIVE_HANDOFF=true)

## System prompt
- NO romper flujo DeepSeek existente; menú es capa antes del router

## Criterios
- [ ] Lead nuevo recibe list message
- [ ] Selección lista dispara flujo correcto
- [ ] typecheck OK
EOF
    ;;
    M11) cat <<'EOF'
Implementa PR M11 — Paq4 Audio/video A4 A5 backend.

## Modelo Cursor: Agent + Sonnet 4.6. Depende M1-M3.

## Parser
- type audio|video → contentType, mediaId, mimeType (audio/ogg, video/mp4 Meta defaults)

## Outbound
- sendMediaMessage type audio|video (Meta: audio opus/ogg, video mp4)
- Agent multipart: accept audio/*, video/mp4

## Límites
- audio max 16MB, video max 16MB Meta — validar en multer

## Bot mode
- Auto-reply mismo AUTO_REPLY_UNSUPPORTED_MEDIA (no transcribir — fuera F9)

## Criterios
- [ ] Recibir nota voz → guardada + visible metadata en API
- [ ] Agente envía audio/video en human mode
- [ ] typecheck OK
EOF
    ;;
    M12) cat <<'EOF'
Implementa PR M12 — Paq4 Panel audio/video UI + Postman + docs.

## Modelo Cursor: Agent + Composer 2.5 Fast. Depende M11.

## admin MessageBubble
- audio: <audio controls src={mediaUrl}>
- video: <video controls max-height 240>

## Composer attach accept incluye audio/*, video/mp4

## postman — samples webhook audio/video + multipart send

## docs/WA-FEATURES-DEPLOY.md (nuevo, breve)
- Apache proxy /media
- Volume uploads-data backup
- Meta pricing note: session messages $0

## Criterios
- [ ] build:all OK
- [ ] Checklist 10 ítems E2E multimedia en doc
EOF
    ;;
    M-FINAL|M13) cat <<'EOF'
Verificación E2E Paquetes 1–4 — NO agregar features nuevas.

## Modelo Cursor: Agent + Composer 2.5 Fast

1. npm run typecheck && npm run build:all
2. Crear docs/WA-FEATURES-E2E.md checklist:

Paq1:
[ ] Cliente envía imagen → aparece en panel asesor
[ ] Asesor envía PDF → lead recibe en WhatsApp
[ ] Filtro no leídos / sin responder / buscar
[ ] Banner 24h bloquea envío cuando expirada

Paq2:
[ ] Label + pin + archivar
[ ] Nota interna NO llega al lead
[ ] Reassign cambia agente
[ ] Separadores fecha Hoy/Ayer

Paq3:
[ ] Menú interactivo list → opciones
[ ] Brochure PDF bot
[ ] Ubicación sede

Paq4:
[ ] Audio/video roundtrip

3. Actualizar postman/README.md orden pruebas
4. Corregir bugs encontrados (solo bugs, no scope creep)
5. Resumen archivos .env nuevos para VPS

NO commitear secrets. NO push/deploy unless asked.
EOF
    ;;
    *)
      echo "ID desconocido: $id" >&2
      usage
      exit 1
      ;;
  esac
}

main() {
  local id="${1:-}"

  if [[ -z "$id" ]]; then
    usage
    exit 0
  fi

  # Normalizar M13 → M-FINAL
  if [[ "$id" == "M13" ]]; then
    id="M-FINAL"
  fi

  if [[ -z "${META[$id]+x}" ]]; then
    echo "ID desconocido: $id" >&2
    usage
    exit 1
  fi

  echo "# ─────────────────────────────────────────────────────────" >&2
  echo "# ${META[$id]}" >&2
  echo "# Copiar TODO el bloque siguiente → Cursor Agent (chat nuevo)" >&2
  echo "# ─────────────────────────────────────────────────────────" >&2
  echo "" >&2

  print_prompt "$id"
}

main "$@"
