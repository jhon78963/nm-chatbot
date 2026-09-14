# Infra checklist — chatbot.uprit.edu.pe

El código, CI/CD y scripts de deploy ya están listos. El bloqueo actual es **red/AWS**, no aplicación.

## 0. Si SSH desde tu Mac falla (timeout)

Usa **EC2 Instance Connect** en AWS Console → instancia → **Connect** → terminal web.

Pega este comando (configura `.env` si aún no existe en el servidor):

```bash
curl -fsSL https://raw.githubusercontent.com/jhon-livias/chatbot/main/deploy/remote-setup.sh | bash
```

Si necesitas subir el `.env` local en la misma sesión:

```bash
# En tu Mac (cuando SSH funcione):
./deploy/upload-env.sh

# O en Instance Connect, edita manualmente:
nano /opt/chatbot-uprit/.env
curl -fsSL https://raw.githubusercontent.com/jhon-livias/chatbot/main/deploy/remote-setup.sh | bash
```

## 0.1 Error Cloudflare 526 (SSL inválido)

Significa que Cloudflare llega al origin pero el certificado HTTPS del servidor no es válido.

Pasos:
1. Verifica en Cloudflare DNS que `chatbot` apunte al **IP pública actual** del EC2 (AWS Console).
2. Ejecuta `remote-setup.sh` en el servidor (instala Let's Encrypt con certbot).
3. Cloudflare → SSL/TLS → **Full (strict)**.

Durante la emisión del certificado, si certbot falla, pon temporalmente SSL en **Full** (no strict) o desactiva el proxy (nube gris) hasta que certbot termine.

## 1. AWS EC2 Security Group (obligatorio)

En la consola AWS → EC2 → Security Groups → grupo de la instancia `13.217.220.99`:

| Tipo       | Puerto | Origen        | Para qué              |
|------------|--------|---------------|------------------------|
| SSH        | 22     | Tu IP / 0.0.0.0/0 | Deploy + SSH        |
| HTTP       | 80     | 0.0.0.0/0     | Nginx + Certbot        |
| HTTPS      | 443    | 0.0.0.0/0     | Meta webhook (SSL)     |
| Custom TCP | 8080   | 127.0.0.1     | Solo local (Docker)    |

Verifica que la instancia esté **running** y tenga IP pública `13.217.220.99`.

Prueba rápida desde tu Mac:

```bash
nc -z -w 5 13.217.220.99 22 && echo "SSH OK"
nc -z -w 5 13.217.220.99 80 && echo "HTTP OK"
```

## 2. Cloudflare DNS

Registro **A** en Cloudflare:

- **Name:** `chatbot`
- **Content:** `13.217.220.99`
- **Proxy:** activado (nube naranja)

SSL/TLS → modo **Full** (o Full strict tras certbot).

## 3. Deploy automático (ya configurado)

Secrets en GitHub (`Settings → Secrets → Actions`):

- `EC2_SSH_PRIVATE_KEY`, `EC2_HOST`, `EC2_USER`, `EC2_REMOTE_DIR`
- `PRODUCTION_ENV` — contenido completo del `.env` de producción
- `WEBHOOK_VERIFY_TOKEN`

Cada push a `main` ejecuta `.github/workflows/deploy-ec2.yml`.

Re-ejecutar manualmente:

```bash
gh workflow run deploy-ec2.yml
gh run watch
```

## 4. Deploy manual (cuando SSH funcione)

```bash
./deploy/bootstrap-ec2.sh      # primera vez
./deploy/upload-env.sh         # sube .env local al servidor
./deploy/deploy-ec2.sh         # releases
./deploy/verify-setup.sh       # valida DNS + webhook
```

## 5. Meta Developers

| Campo          | Valor                                      |
|----------------|--------------------------------------------|
| Callback URL   | `https://chatbot.uprit.edu.pe/webhook`     |
| Verify token   | valor de `META_WEBHOOK_VERIFY_TOKEN`       |
| App Secret     | mismo valor que `WEBHOOK_SECRET` en `.env` |

Verificación:

```bash
curl "https://chatbot.uprit.edu.pe/webhook?hub.mode=subscribe&hub.verify_token=TU_TOKEN&hub.challenge=test123"
# Debe responder: test123
```

## 6. SSL en el servidor (tras abrir puertos)

```bash
ssh -i vps/RepositoryMagazine.pem ubuntu@ec2-3-235-20-207.compute-1.amazonaws.com
# o: ./vps/connect.sh home
sudo certbot --nginx -d chatbot.uprit.edu.pe
```
