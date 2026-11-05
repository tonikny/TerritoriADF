#!/usr/bin/env bash
#
# Renderitza el lloc nginx del host a partir de la plantilla.
# El domini surt d'APP_DOMAIN o, si no es defineix, de BASE_DOMAIN_URL a back/.env.
#
# Ús: npm run nginx:render
#      APP_DOMAIN=exemple.org bash scripts/render-nginx.sh
#
# Genera config/site-docker.nginx (ignorat per git). Després, al servidor, com a
# root (l'usuari que desplega no té sudo):
#   cp config/site-docker.nginx /etc/nginx/sites-available/territoriadf
#   ln -sfn /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf
#   nginx -t && systemctl reload nginx

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$PROJECT_DIR/config/site-docker.nginx.example"
OUTPUT="${NGINX_SITE_OUTPUT:-$PROJECT_DIR/config/site-docker.nginx}"
ENV_FILE="$PROJECT_DIR/back/.env"

die() {
  echo "ERROR: $1" >&2
  exit 1
}

[[ -f "$TEMPLATE" ]] || die "falta la plantilla $TEMPLATE"

DOMAIN="${APP_DOMAIN:-${BASE_DOMAIN_URL:-}}"
if [[ -z "$DOMAIN" && -f "$ENV_FILE" ]]; then
  DOMAIN=$(sed -n 's/^[[:space:]]*BASE_DOMAIN_URL[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" | tail -n 1)
fi

# Tolerant a cometes, \r i espais al voltant del valor.
DOMAIN=$(printf '%s' "$DOMAIN" | tr -d '\r' | tr -d '"' | tr -d "'" | xargs)

[[ -n "$DOMAIN" ]] || die "no hi ha domini. Defineix BASE_DOMAIN_URL a back/.env o passa APP_DOMAIN=..."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] \
  || die "el domini '$DOMAIN' no és vàlid (només lletres, xifres, punts i guions)"

mkdir -p "$(dirname "$OUTPUT")"
sed "s|__APP_DOMAIN__|$DOMAIN|g" "$TEMPLATE" > "$OUTPUT"

echo "Plantilla renderitzada: $OUTPUT"
echo "Domini: $DOMAIN"
echo ""
echo "Al servidor, com a root (l'usuari que desplega no té sudo):"
echo "  cp \"$OUTPUT\" /etc/nginx/sites-available/territoriadf"
echo "  ln -sfn /etc/nginx/sites-available/territoriadf /etc/nginx/sites-enabled/territoriadf"
echo "  nginx -t && systemctl reload nginx"
