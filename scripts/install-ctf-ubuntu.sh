#!/usr/bin/env bash
# Instalación de general-workshop-ctf publicado por HTTPS (443) con Let's Encrypt.
#
# Uso:
#   ./install-ctf.sh <dominio> <email>
# Ejemplo:
#   ./install-ctf.sh ctf.midominio.com yo@midominio.com
#
# Requisitos previos:
#   - Ubuntu con acceso sudo
#   - Registro DNS A de <dominio> apuntando a la IP pública de esta máquina
#   - Puertos 80 y 443 abiertos desde Internet (el 80 lo necesita Let's Encrypt
#     para validar el dominio y para redirigir HTTP -> HTTPS)
#
# Arquitectura:
#   Internet --443/80--> Caddy (host, Let's Encrypt) --> 127.0.0.1:3002 (contenedor)

set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_PORT=3002   # puerto interno de la app (docker-compose.yml del repo)
REPO_URL="https://github.com/ns-ifranzoni/general-workshop-ctf.git"
REPO_DIR="general-workshop-ctf"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Uso: $0 <dominio> <email>"
  exit 1
fi

echo "==> [1/5] Instalando Docker"
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git
sudo mkdir -p /etc/apt/keyrings
if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin python3-pip python3-venv
# Se elimina docker-compose 1.29.2 (obsoleto): el plugin "docker compose" ya lo sustituye.
sudo systemctl enable --now docker

echo "==> [2/5] Clonando / actualizando el repo"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "==> [3/5] Levantando la aplicación (solo accesible desde localhost)"
cd "$REPO_DIR"
# El compose del repo publica 3002:3002 en todas las interfaces (HTTP en claro).
# Este override lo restringe a 127.0.0.1 para que solo se entre por HTTPS vía Caddy.
# (!override requiere Docker Compose >= 2.24, incluido en docker-compose-plugin actual)
cat > docker-compose.override.yml <<EOF
services:
  general-workshop-ctf:
    ports: !override
      - "127.0.0.1:${APP_PORT}:${APP_PORT}"
EOF
sudo docker compose up -d --build

echo "    Esperando a que la app responda..."
for i in {1..30}; do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health" > /dev/null 2>&1; then
    echo "    App OK"
    break
  fi
  [[ $i -eq 30 ]] && { echo "ERROR: la app no responde. Revisa: sudo docker compose logs"; exit 1; }
  sleep 2
done
cd ..

echo "==> [4/5] Instalando Caddy (reverse proxy con Let's Encrypt automático)"
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
if [[ ! -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg ]]; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
fi
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
sudo apt-get update
sudo apt-get install -y caddy

echo "==> [5/5] Configurando HTTPS para ${DOMAIN} -> 127.0.0.1:${APP_PORT}"
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${DOMAIN} {
    tls ${EMAIL}
    encode gzip
    reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
sudo systemctl enable caddy
sudo systemctl restart caddy

echo
echo "Listo. Caddy solicita el certificado a Let's Encrypt al arrancar (tarda unos segundos)."
echo "URL:    https://${DOMAIN}"
echo "Admin:  usuario ADMIN-2026 (sin contraseña; la pide fijar en el primer login)"
echo "Logs:   sudo journalctl -u caddy -f"
