#!/usr/bin/env bash
#
# Renderitza mosquitto.conf a partir de la plantilla.
# Equivalent a `npm run nginx:render` però per a Mosquitto.
#
# Ús: npm run mosquitto:render
#      npm run mosquitto:render -- --dev
#      bash scripts/render-mosquitto.sh [--prod|--dev]
#
# Per defecte genera la de producció (amb TLS). La de dev (text pla) només
# per a desenvolupament local i cal demanar-la explícitament amb --dev.
#
# Genera mosquitto/config/mosquitto.conf (ignorat per git). Després:
#   docker compose restart mosquitto
#   docker compose logs mosquitto | grep 51823   # esperat: Opening TLS listening socket

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE_PROD="$PROJECT_DIR/mosquitto/config/mosquitto.conf.example"
TEMPLATE_DEV="$PROJECT_DIR/mosquitto/config/mosquitto.dev.conf.example"
OUTPUT="${MOSQUITTO_OUTPUT:-$PROJECT_DIR/mosquitto/config/mosquitto.conf}"

die() {
  echo "ERROR: $1" >&2
  exit 1
}

MODE="prod"
for arg in "$@"; do
  case "$arg" in
    --prod) MODE="prod" ;;
    --dev) MODE="dev" ;;
    -h|--help)
      sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "opció desconeguda: $arg (usa --prod o --dev)" ;;
  esac
done

if [[ "$MODE" == "dev" ]]; then
  [[ -f "$TEMPLATE_DEV" ]] || die "falta la plantilla $TEMPLATE_DEV"
  mkdir -p "$(dirname "$OUTPUT")"
  cp "$TEMPLATE_DEV" "$OUTPUT"
  echo "Plantilla renderitzada (DEV, TEXT PLA): $OUTPUT"
  echo ""
  echo "ATENCIÓ: aquesta conf va en clar i només serveix per a desenvolupament local."
  echo "En producció genera la de prod (per defecte) i reinicia:"
  echo "  npm run mosquitto:render"
  echo "  docker compose restart mosquitto"
else
  [[ -f "$TEMPLATE_PROD" ]] || die "falta la plantilla $TEMPLATE_PROD"
  mkdir -p "$(dirname "$OUTPUT")"
  cp "$TEMPLATE_PROD" "$OUTPUT"
  # Fail-closed: la plantilla de prod ha de portar TLS pel 51823 publicat a 0.0.0.0.
  grep -qE '^[[:space:]]*certfile[[:space:]]+' "$OUTPUT" \
    || die "la plantilla $TEMPLATE_PROD no porta 'certfile'"
  grep -qE '^[[:space:]]*keyfile[[:space:]]+' "$OUTPUT" \
    || die "la plantilla $TEMPLATE_PROD no porta 'keyfile'"
  grep -qE '^[[:space:]]*tls_version[[:space:]]+' "$OUTPUT" \
    || die "la plantilla $TEMPLATE_PROD no porta 'tls_version'"
  echo "Plantilla renderitzada (PROD, amb TLS): $OUTPUT"
  echo ""
  echo "Al servidor, després de tenir els certs a mosquitto/certs/:"
  echo "  docker compose restart mosquitto"
  echo "  docker compose logs mosquitto | grep 51823   # esperat: Opening TLS listening socket"
fi
