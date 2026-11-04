#!/bin/sh
set -e

# Certbot executa els hooks des de /etc/letsencrypt/renewal-hooks/deploy/, on
# aquest script hi és com a enllaç simbòlic: $0 apunta a l'enllaç, no al repo.
# Sense resoldre'l, PROJECT_DIR quedaria a /etc/letsencrypt/renewal-hooks.
SELF=$0
while [ -L "$SELF" ]; do
    LINK=$(readlink "$SELF")
    case $LINK in
        /*) SELF=$LINK ;;
        *) SELF=$(dirname "$SELF")/$LINK ;;
    esac
done
SCRIPT_DIR=$(cd "$(dirname "$SELF")" && pwd)
PROJECT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
CERTS_DIR="$PROJECT_DIR/mosquitto/certs"

# Tolerant a espais al voltant del '=' i a cometes (`BASE_DOMAIN_URL = "domini"`).
DOMAIN=$(sed -n 's/^[[:space:]]*BASE_DOMAIN_URL[[:space:]]*=[[:space:]]*//p' "$PROJECT_DIR/back/.env" \
    | tr -d '"\r' | sed 's/[[:space:]]*$//' | tail -n 1)
if [ -z "$DOMAIN" ]; then
    echo "ERROR: no trobo BASE_DOMAIN_URL a back/.env" >&2
    exit 1
fi

# certbot crida el hook per a qualsevol certificat renovat: només interessa el
# nostre domini. Amb RENEWED_LINEAGE buit (execució manual) es fa igualment.
case "$RENEWED_LINEAGE" in
    "" | */live/"$DOMAIN") ;;
    *)
        echo "Hook: $RENEWED_LINEAGE no és $DOMAIN, no hi ha res a fer."
        exit 0
        ;;
esac

LIVE_DIR="/etc/letsencrypt/live/$DOMAIN"
if [ ! -f "$LIVE_DIR/fullchain.pem" ]; then
    echo "ERROR: no existeix $LIVE_DIR/fullchain.pem (BASE_DOMAIN_URL=$DOMAIN)." >&2
    echo "       BASE_DOMAIN_URL ha de ser el domini del certificat, no una IP." >&2
    exit 1
fi

mkdir -p "$CERTS_DIR"
cp "$LIVE_DIR/fullchain.pem" "$CERTS_DIR/fullchain.pem"
cp "$LIVE_DIR/privkey.pem" "$CERTS_DIR/privkey.pem"

chmod 644 "$CERTS_DIR/fullchain.pem"
chmod 600 "$CERTS_DIR/privkey.pem"
chown 1883:1883 "$CERTS_DIR/privkey.pem"

cd "$PROJECT_DIR" && docker compose restart mosquitto
echo "Hook: certificat de $DOMAIN copiat a $CERTS_DIR i Mosquitto reiniciat."
