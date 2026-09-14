# Deploy — admision.uprit.edu.pe (Panel Asesores)

Panel React para asesores comerciales en **admision.uprit.edu.pe**, separado del webhook Meta en **chatbot.uprit.edu.pe**.

## Arquitectura en producción

```
admision.uprit.edu.pe          chatbot.uprit.edu.pe
        │                              │
   Nginx (host)                   Nginx (host)
        │                              │
   /  → admin/dist (SPA)          /webhook → :8090
   /api → proxy :8090             /health  → :8090
   /api/v1/ws → WS upgrade :8090
        │                              │
        └──────────┬───────────────────┘
                   │
            Docker app :8090
            (Node.js backend)
```

| Dominio | Qué sirve | Qué NO sirve |
|---------|-----------|--------------|
| `admision.uprit.edu.pe` | Login, inbox, chat (React) + `/api/*` proxy | `/webhook` |
| `chatbot.uprit.edu.pe` | `/webhook`, `/health` | Panel admin, `/api` público |

En producción el panel usa **same-origin** (`/api/v1/...`), por lo que no hay CORS cross-domain.

## DNS (Cloudflare o registrador)

Registro **A** apuntando a la **misma IP** del VPS que `chatbot.uprit.edu.pe`:

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | `admision` | IP del VPS (ej. misma que chatbot) |

Si usas Cloudflare:
- SSL/TLS → **Full (strict)** (igual que chatbot)
- Durante emisión del certificado, puedes usar **Full** temporalmente o nube gris hasta que certbot termine

## Variables de entorno (.env en VPS)

Agregar o verificar en `/opt/chatbot-uprit/.env`:

```env
API_PORT=8090
ADMISION_PANEL_URL=https://admision.uprit.edu.pe
ADMISION_CORS_ORIGIN=https://admision.uprit.edu.pe
JWT_SECRET=<secreto-largo-aleatorio-min-32-chars>
JWT_EXPIRES_IN=8h
```

**No commitear** `.env` ni `JWT_SECRET` al repositorio.

## Deploy inicial (una vez)

En el VPS, desde `/opt/chatbot-uprit`:

```bash
git pull origin human-handoff   # o main cuando se mergee
bash deploy/setup-admision-domain.sh
```

El script:
1. Ejecuta `npm run build:all` (backend + `admin/dist`)
2. Copia `deploy/nginx/admision.uprit.edu.pe.conf` → `/etc/nginx/sites-enabled/`
3. Emite certificado SSL con certbot
4. Recarga nginx

## Deploy de actualizaciones (rutina)

```bash
cd /opt/chatbot-uprit
git pull --ff-only
npm run build:all
docker compose up -d --build app
sudo systemctl reload nginx
```

Solo si cambió la config nginx:

```bash
sudo cp deploy/nginx/admision.uprit.edu.pe.conf /etc/nginx/sites-available/
sudo nginx -t && sudo systemctl reload nginx
```

## Credenciales de asesores

```bash
cd /opt/chatbot-uprit
node --env-file=.env deploy/seed-agent-passwords.mjs
```

Imprime usuarios y contraseñas temporales. Compartir de forma segura con cada asesor.

## Verificación post-deploy

```bash
# Panel carga
curl -I https://admision.uprit.edu.pe/

# Health backend (vía chatbot)
curl -fsS https://chatbot.uprit.edu.pe/health

# Login API (reemplazar credenciales)
curl -X POST https://admision.uprit.edu.pe/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"tu.usuario","password":"tu-password"}'
```

Checklist manual:
- [ ] `https://admision.uprit.edu.pe` muestra pantalla de login
- [ ] Login con asesor → entra al inbox
- [ ] Banner **Conectado** (WebSocket); DevTools → Network → WS → status **101**
- [ ] Responder en chat → lead recibe WhatsApp
- [ ] `https://chatbot.uprit.edu.pe/webhook` sigue operativo (Meta)
- [ ] Sin errores CORS en consola del navegador (admision)

## Archivos de configuración

En producción el VPS usa **Apache** (puertos 80/443). Nginx en el repo aplica a entornos bootstrap con nginx solo.

| Archivo | Uso |
|---------|-----|
| `deploy/apache/admision.uprit.edu.pe.conf` | HTTP → redirect + proxy `/api` + WS |
| `deploy/apache/admision-le-ssl.conf` | HTTPS panel + proxy `/api` + WS |
| `deploy/nginx/chatbot.uprit.edu.pe.conf` | Solo webhook + health |
| `deploy/setup-admision-domain.sh` | Bootstrap automatizado |
| `admin/dist/` | Build del panel (generado, no versionar) |

## Docker multi-stage

El `Dockerfile` incluye stage `admin-build` que compila el panel. En producción actual el panel se sirve desde el filesystem del host (`/opt/chatbot-uprit/admin/dist`), no desde el contenedor `app`.

Para extraer el build admin desde Docker (opcional):

```bash
docker build --target admin-build -t chatbot-admin-build .
docker create --name admin-artifacts chatbot-admin-build
docker cp admin-artifacts:/app/admin/dist ./admin/dist
docker rm admin-artifacts
```

## Troubleshooting

| Problema | Solución |
|----------|----------|
| WS "Reconectando…" permanente | Verificar `location /api/v1/ws` en nginx con headers `Upgrade`/`Connection upgrade`; `sudo nginx -t && sudo systemctl reload nginx` |
| 502 en `/api` | Verificar `docker compose ps app` y `curl http://127.0.0.1:8090/health` |
| Pantalla en blanco | Verificar `admin/dist/index.html` existe; `npm run admin:build` |
| 404 en rutas React | Nginx debe tener `try_files $uri $uri/ /index.html` |
| CORS en prod | No debería ocurrir (same-origin). Revisar que el panel use `VITE_API_BASE_URL=''` en prod |
| Cloudflare 526 | Certificado SSL inválido — ejecutar certbot o revisar DNS |
