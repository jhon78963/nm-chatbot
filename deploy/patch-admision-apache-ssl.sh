#!/usr/bin/env bash
# patch-admision-apache-ssl.sh — fix /api proxy on SSL vhost (no FallbackResource)
set -euo pipefail

CONF="/etc/apache2/sites-available/admision-le-ssl.conf"
SRC="/opt/chatbot-uprit/deploy/apache/admision.uprit.edu.pe.conf"

if [[ ! -f "$CONF" ]]; then
  echo "SSL vhost not found, run setup-admision-apache.sh first" >&2
  exit 1
fi

# Re-copy HTTP template structure into SSL vhost body (keep SSL lines at bottom)
sudo cp "$SRC" /tmp/admision-base.conf
# Extract SSL cert lines from existing le-ssl
SSL_BLOCK=$(awk '/SSLCertificateFile/,/Include.*options-ssl-apache/' "$CONF")

sudo tee "$CONF" > /dev/null <<EOF
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName admision.uprit.edu.pe
    ServerAdmin soporte@uprit.edu.pe

    DocumentRoot /opt/chatbot-uprit/admin/dist

    ProxyPreserveHost On
    ProxyPass /api/ http://127.0.0.1:8090/api/
    ProxyPassReverse /api/ http://127.0.0.1:8090/api/

    <Directory /opt/chatbot-uprit/admin/dist>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted
        RewriteEngine On
        RewriteBase /
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_URI} !^/api/
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/admision-error.log
    CustomLog \${APACHE_LOG_DIR}/admision-access.log combined

${SSL_BLOCK}
</VirtualHost>
</IfModule>
EOF

sudo apachectl configtest
sudo systemctl reload apache2
echo "admision-le-ssl.conf patched"
