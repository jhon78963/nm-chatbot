# Checklist E2E — Paquetes 1–4 (multimedia WhatsApp)

Verificación manual en **producción** (`admision.uprit.edu.pe` + lead real) o **local** (`npm run dev` + `npm run admin:dev`).

**Build previo:** `npm run typecheck && npm run build:all` debe pasar.

**Referencias:** `postman/README.md` (API), `docs/WA-FEATURES-DEPLOY.md` (VPS / media / backup).

---

## Paq 1 — Imagen, PDF, inbox, ventana 24h

- [ ] Cliente envía imagen → aparece en panel asesor
- [ ] Asesor envía PDF → lead recibe en WhatsApp
- [ ] Filtro no leídos / sin responder / buscar
- [ ] Banner 24h bloquea envío cuando expirada

## Paq 2 — Organización del inbox

- [ ] Label + pin + archivar
- [ ] Nota interna NO llega al lead
- [ ] Reassign cambia agente
- [ ] Separadores fecha Hoy/Ayer

## Paq 3 — Interactivo, brochure, ubicación

- [ ] Menú interactivo list → opciones
- [ ] Brochure PDF bot
- [ ] Ubicación sede

## Paq 4 — Audio / video

- [ ] Audio/video roundtrip (lead → panel + agente → lead)

---

## Orden sugerido de prueba

1. **Smoke API** — Postman: health, webhook verify, firma inválida (ver `postman/README.md` § Orden E2E).
2. **Paq 1** — Imagen inbound, PDF outbound, filtros inbox, banner 24h.
3. **Paq 2** — Labels, pin, archivar, nota interna, reassign, separadores fecha.
4. **Paq 3** — Menú list (keyword `menu`), brochure (`folleto`/`pdf`), ubicación inbound o opción menú.
5. **Paq 4** — Nota de voz inbound, video outbound desde composer del panel.

## Variables `.env` en VPS (multimedia + panel)

Revisar que existan en `/opt/chatbot-uprit/.env` (ver `.env.example`):

| Variable | Uso |
| -------- | --- |
| `MEDIA_STORAGE_PATH` | Ruta uploads en contenedor (`/app/uploads`) |
| `MEDIA_PUBLIC_BASE_URL` | Base pública media (`https://admision.uprit.edu.pe/media`) |
| `AUTO_REPLY_UNSUPPORTED_MEDIA` | Auto-reply bot ante media sin DeepSeek |
| `LOCATION_*` | Sede UPRIT para menú / outbound A7 |
| `INTERACTIVE_HANDOFF` | Botones Sí/No en handoff (`true`/`false`) |
| `ADMISION_PANEL_URL` | Link en notificación al agente |
| `ADMISION_CORS_ORIGIN` | CORS panel producción |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Auth agentes |

Apache: proxy `/api/` y `/media/` → `:8090` (`deploy/apache/admision-le-ssl.conf`).

Docker: volumen `uploads-data` montado en `/app/uploads`.
