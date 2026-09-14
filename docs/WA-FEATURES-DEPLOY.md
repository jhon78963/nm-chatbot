# Deploy — funciones multimedia WhatsApp (Paq 1–4)

Guía breve para producción en VPS `/opt/chatbot-uprit` con Apache en `admision.uprit.edu.pe`.

## Apache — proxy `/media`

Los archivos inbound/outbound se sirven en `GET /media/:conversationId/:storageKey` (JWT requerido). El panel usa same-origin en admision; Apache debe proxyar `/media` al backend `:8090`.

En `deploy/apache/admision.uprit.edu.pe.conf` y `admision-le-ssl.conf` (junto al proxy `/api/`):

```apache
ProxyPass /media/ http://127.0.0.1:8090/media/
ProxyPassReverse /media/ http://127.0.0.1:8090/media/
```

Variables en `.env`:

```env
MEDIA_STORAGE_PATH=/app/uploads
MEDIA_PUBLIC_BASE_URL=https://admision.uprit.edu.pe/media
```

Tras editar:

```bash
sudo cp deploy/apache/admision*.conf /etc/apache2/sites-available/
sudo apachectl configtest && sudo systemctl reload apache2
```

## Docker — volumen `uploads-data`

`docker-compose.yml` monta el volumen nombrado `uploads-data` en `/app/uploads`. Los media **no** están en la imagen; persisten en el volumen.

**Backup periódico** (ejemplo):

```bash
docker run --rm \
  -v chatbot-uprit_uploads-data:/data:ro \
  -v /opt/backups:/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

Restaurar:

```bash
docker run --rm \
  -v chatbot-uprit_uploads-data:/data \
  -v /opt/backups:/backup \
  alpine tar xzf /backup/uploads-YYYYMMDD.tar.gz -C /data
```

Verificar nombre del volumen: `docker volume ls | grep uploads`.

## Meta — pricing (referencia)

Dentro de la **ventana de servicio al cliente de 24 h**, los mensajes de sesión (texto, imagen, documento, audio, video, interactivos) se facturan como **conversación de servicio** — tarifa **$0** por mensaje en la mayoría de mercados (consultar [Meta WhatsApp Pricing](https://developers.facebook.com/docs/whatsapp/pricing) para tu país).

Fuera de ventana 24h solo aplican plantillas aprobadas (costo distinto).

## Checklist E2E multimedia (10 ítems)

Usar panel `https://admision.uprit.edu.pe` + lead real en WhatsApp.

### Paq 1 — Imagen / PDF / inbox

- [ ] **1.** Lead envía imagen → aparece preview en panel del agente asignado
- [ ] **2.** Agente envía PDF multipart → lead recibe documento en el mismo hilo
- [ ] **3.** Filtros inbox: no leídos / sin responder / búsqueda por nombre o teléfono

### Paq 2 — Organización

- [ ] **4.** Etiqueta + pin: chat pinned sube al tope de la lista
- [ ] **5.** Nota interna: visible en panel, **no** llega al lead por WhatsApp

### Paq 3 — Interactivo / ubicación

- [ ] **6.** Menú interactivo (list) → opción dispara flujo esperado (carreras / handoff)
- [ ] **7.** Ubicación sede inbound → link Google Maps en burbuja del panel

### Paq 4 — Audio / video

- [ ] **8.** Lead envía nota de voz → `<audio controls>` reproducible en panel
- [ ] **9.** Agente adjunta video MP4 → lead recibe video; panel muestra `<video controls>`
- [ ] **10.** Banner ventana 24h cerrada bloquea envío (texto y adjuntos)

## Build y deploy panel

```bash
cd /opt/chatbot-uprit
git pull
npm run typecheck && npm run build:all
docker compose up -d --build app
sudo systemctl reload apache2
```

## Pruebas API

Ver `postman/README.md` — requests webhook audio/video (A4/A5) y multipart outbound.
