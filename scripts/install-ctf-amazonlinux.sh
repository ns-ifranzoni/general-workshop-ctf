#!/usr/bin/env bash
# Instalación de general-workshop-ctf en Amazon Linux (2023 o 2) publicado
# por HTTPS (443) con Let's Encrypt.
#
# Uso (SIN sudo; el script ya lo usa donde hace falta):
#   ./install-ctf-amazonlinux.sh <dominio> <email>
# Ejemplo:
#   ./install-ctf-amazonlinux.sh ctf.ib-demo.com admin@ib-demo.com
#
# Requisitos previos:
#   - Registro DNS A de <dominio> apuntando a la IP pública de la instancia
#   - Security Group con TCP 80 y 443 abiertos desde Internet (el 80 lo necesita
#     Let's Encrypt para validar el dominio y para redirigir HTTP -> HTTPS)
#
# Arquitectura:
#   Internet --443/80--> Caddy (contenedor, Let's Encrypt) --> 127.0.0.1:3002 (app)

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

if [[ $EUID -eq 0 ]]; then
  echo "ERROR: no ejecutes el script como root/sudo; lanzalo como ec2-user."
  exit 1
fi

PKG="$(command -v dnf || command -v yum || true)"
if [[ -z "$PKG" ]]; then
  echo "ERROR: no encuentro dnf ni yum. Este script es para Amazon Linux."
  exit 1
fi

case "$(uname -m)" in
  x86_64)  COMPOSE_ARCH="x86_64";  BUILDX_ARCH="amd64" ;;
  aarch64) COMPOSE_ARCH="aarch64"; BUILDX_ARCH="arm64" ;;
  *) echo "ERROR: arquitectura no soportada: $(uname -m)"; exit 1 ;;
esac

echo "==> [1/5] Instalando Docker, git y plugins (compose, buildx)"
sudo "$PKG" install -y docker git python3-pip
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true   # efectivo en el proximo login; aqui usamos sudo docker

PLUGIN_DIR=/usr/local/lib/docker/cli-plugins
sudo mkdir -p "$PLUGIN_DIR"

# docker compose v2 (plugin)
sudo curl -fsSL \
  "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
  -o "$PLUGIN_DIR/docker-compose"
sudo chmod +x "$PLUGIN_DIR/docker-compose"

# docker buildx (lo exigen las versiones recientes de compose para --build)
BUILDX_TAG="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/##')"
sudo curl -fsSL \
  "https://github.com/docker/buildx/releases/download/${BUILDX_TAG}/buildx-${BUILDX_TAG}.linux-${BUILDX_ARCH}" \
  -o "$PLUGIN_DIR/docker-buildx"
sudo chmod +x "$PLUGIN_DIR/docker-buildx"

sudo docker compose version
sudo docker buildx version

echo "==> [2/5] Clonando / actualizando el repo"
if [[ -d "$REPO_DIR/.git" ]]; then
  git -C "$REPO_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$REPO_DIR"
fi

echo "==> [3/5] Levantando la aplicacion (solo accesible desde localhost)"
cd "$REPO_DIR"
# El compose del repo publica 3002:3002 en todas las interfaces (HTTP en claro).
# Este override lo restringe a 127.0.0.1 para que solo se entre por HTTPS via Caddy.
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
  if [[ $i -eq 30 ]]; then
    echo "ERROR: la app no responde. Revisa: cd ~/${REPO_DIR} && sudo docker compose logs"
    exit 1
  fi
  sleep 2
done
cd ..

echo "==> [4/5] Configurando Caddy para ${DOMAIN} -> 127.0.0.1:${APP_PORT}"
sudo mkdir -p /etc/caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
${DOMAIN} {
    tls ${EMAIL}
    encode gzip
    reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF

echo "==> [5/5] Arrancando Caddy (Let's Encrypt automatico)"
sudo docker rm -f caddy > /dev/null 2>&1 || true
# --network host: Caddy escucha directamente en 80/443 y alcanza 127.0.0.1:3002.
# El volumen caddy_data conserva el certificado entre reinicios (evita limites de Let's Encrypt).
sudo docker run -d --name caddy --restart unless-stopped \
  --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data \
  -v caddy_config:/config \
  caddy:2

echo "    Esperando al certificado..."
sleep 15
sudo docker logs caddy 2>&1 | grep -iE "certificate obtained|error|failed" | tail -5 || true

echo
echo "Listo. URL:    https://${DOMAIN}"
echo "Admin:         usuario ADMIN-2026 (sin password; la pide fijar en el primer login)"
echo "Logs Caddy:    sudo docker logs -f caddy"
echo "Logs app:      cd ~/${REPO_DIR} && sudo docker compose logs -f"
