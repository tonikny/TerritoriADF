#!/bin/bash
#
# Script de Backup Automàtic per TerritoriADF
# ============================================
# Autor: OpenCode
# Data: 2026-06-29
#
# Ús: ./backup.sh [daily|weekly|monthly|semester]
#
# Aquest script:
# - Atura temporalment el contenidor backend
# - Fa checkpoint de SQLite per consolidar el WAL
# - Comprimeix tot el directori back/data/
# - Gestiona la rotació automàtica segons la política
# - Reinicia el contenidor
# - Envia notificació per Telegram (opcional)

set -e  # Sortir si hi ha errors

# ============================================
# CONFIGURACIÓ
# ============================================

# Directori base del projecte (assumeix que l'script està a scripts/backup/)
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_BASE_DIR="$PROJECT_DIR/backups"
DATA_DIR="$PROJECT_DIR/back/data"
CONTAINER_NAME="territoriadf-backend"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Carregar variables d'entorn per Telegram (opcional)
ENV_FILE="$PROJECT_DIR/back/.env"
if [ -f "$ENV_FILE" ]; then
    set -a  # Exportar automàticament les variables
    source <(grep -E '^[A-Z_]+[A-Z0-9_]*=' "$ENV_FILE")
    set +a
fi

# Colors per output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================
# FUNCIONS
# ============================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Límit de l'API de Telegram per a un document enviat per un bot.
TELEGRAM_MAX_DOCUMENT_BYTES=$((50 * 1024 * 1024))

send_telegram() {
    local MESSAGE="$1"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
        # URL-encode el missatge per evitar problemes amb caràcters especials
        local ENCODED_MESSAGE=$(printf '%s' "$MESSAGE" | jq -sRr @uri)
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=$ENCODED_MESSAGE" \
            -d "parse_mode=HTML" \
            -d "disable_notification=true" > /dev/null 2>&1
    fi
}

# Envia un fitxer com a document. Retorna 0 només si Telegram l'ha acceptat:
# un enviament fallit no ha de fer fallar el backup (el tar.gz local ja hi és),
# però ha de quedar clar al missatge de resultat.
send_telegram_document() {
    local FILE="$1" CAPTION="${2:-}" FILENAME="${3:-}" SIZE

    if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
        log_warning "Telegram no està configurat: no s'envia el document"
        return 1
    fi

    SIZE=$(stat -c %s "$FILE")
    if [ "$SIZE" -gt "$TELEGRAM_MAX_DOCUMENT_BYTES" ]; then
        log_warning "El document fa $(du -h "$FILE" | cut -f1) i supera el límit de 50 MB de Telegram: no s'envia"
        return 1
    fi

    # Nom amb què arriba el fitxer al xat (el temporal pot ser un `mktemp`).
    FILENAME="${FILENAME:-$(basename "$FILE")}"
    if curl -sS --fail --max-time 120 -X POST \
        "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendDocument" \
        -F "chat_id=$TELEGRAM_CHAT_ID" \
        -F "document=@$FILE;filename=$FILENAME" \
        --form-string "caption=${CAPTION:0:1000}" \
        --form-string "disable_notification=true" > /dev/null; then
        log_success "Document enviat per Telegram: $FILENAME ($(du -h "$FILE" | cut -f1))"
        return 0
    fi

    log_warning "Telegram ha rebutjat el document: $FILENAME"
    return 1
}

# Ruta de la BD, amb compatibilitat per al nom anterior del fitxer.
db_file_path() {
    local DB_FILE="$DATA_DIR/territoriadf.db"
    if [ ! -f "$DB_FILE" ]; then
        DB_FILE="$DATA_DIR/hidrants.db"
    fi
    printf '%s' "$DB_FILE"
}

# Còpia de la base de dades comprimida com a document: és l'única peça que no es
# pot reconstruir, i el tar.gz sencer (WAL inclòs) no s'ha d'enviar a Telegram.
# S'executa amb el contenidor aturat, després del checkpoint, així que el fitxer
# és consistent.
send_db_copy() {
    local BACKUP_TYPE="$1"
    local DB_FILE DB_COPY RESULT

    DB_FILE=$(db_file_path)
    if [ ! -f "$DB_FILE" ]; then
        log_warning "No hi ha base de dades a $DB_FILE: no s'envia la còpia"
        return 1
    fi

    DB_COPY=$(mktemp --suffix=.db.gz)
    if ! gzip -c "$DB_FILE" > "$DB_COPY"; then
        log_warning "No s'ha pogut comprimir la base de dades"
        rm -f "$DB_COPY"
        return 1
    fi

    RESULT=0
    send_telegram_document "$DB_COPY" \
        "🗄️ <b>Còpia de la BD</b> · $BACKUP_TYPE · $(date '+%Y-%m-%d %H:%M')" \
        "territoriadf_${BACKUP_TYPE}_${TIMESTAMP}.db.gz" || RESULT=$?

    rm -f "$DB_COPY"
    return $RESULT
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker no està instal·lat o no està al PATH"
        exit 1
    fi
    
    if ! docker ps &> /dev/null; then
        log_error "No es pot connectar amb Docker. Tens permisos?"
        exit 1
    fi
}

check_container() {
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_error "El contenidor '$CONTAINER_NAME' no existeix"
        exit 1
    fi
}

stop_container() {
    log_info "Aturant el contenidor $CONTAINER_NAME..."
    if docker stop "$CONTAINER_NAME" > /dev/null 2>&1; then
        log_success "Contenidor aturat"
        return 0
    else
        log_warning "No s'ha pogut aturar el contenidor (potser ja estava aturat)"
        return 1
    fi
}

start_container() {
    log_info "Reiniciant el contenidor $CONTAINER_NAME..."
    if docker start "$CONTAINER_NAME" > /dev/null 2>&1; then
        log_success "Contenidor reiniciat"
        return 0
    else
        log_error "No s'ha pogut reiniciar el contenidor!"
        return 1
    fi
}

# Retorna 0 només si el WAL ha quedat consolidat: si no, el fitxer .db sol no
# és una còpia completa i no s'ha d'enviar fora del servidor.
sqlite_checkpoint() {
    local DB_FILE
    DB_FILE=$(db_file_path)

    if [ ! -f "$DB_FILE" ]; then
        log_warning "La base de dades no existeix a $DB_FILE"
        return 1
    fi
    
    log_info "Fent checkpoint de SQLite per consolidar el WAL..."
    
    if ! command -v sqlite3 &> /dev/null; then
        log_warning "sqlite3 no està instal·lat, saltant checkpoint"
        return 1
    fi

    if sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(TRUNCATE);" > /dev/null 2>&1; then
        log_success "Checkpoint completat"
        return 0
    fi

    log_warning "Checkpoint fallit: es continua amb el backup (el WAL queda al tar)"
    return 1
}

create_backup() {
    local BACKUP_TYPE="$1"
    local BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_TYPE"
    CREATED_BACKUP_FILE="$BACKUP_DIR/territoriadf_${BACKUP_TYPE}_${TIMESTAMP}.tar.gz"
    
    # Crear directori si no existeix
    mkdir -p "$BACKUP_DIR"
    
    log_info "Creant backup $BACKUP_TYPE..."
    log_info "Origen: $DATA_DIR"
    log_info "Destí: $CREATED_BACKUP_FILE"
    
    # Crear backup comprimit
    if tar -czf "$CREATED_BACKUP_FILE" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")" 2>/dev/null; then
        local SIZE=$(du -h "$CREATED_BACKUP_FILE" | cut -f1)
        log_success "Backup creat correctament ($SIZE)"
        return 0
    else
        log_error "Error creant el backup"
        return 1
    fi
}

rotate_backups() {
    local BACKUP_TYPE="$1"
    local BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_TYPE"
    local KEEP_COUNT=1
    
    log_info "Gestionant rotació de backups $BACKUP_TYPE (es mantenen $KEEP_COUNT)..."
    
    # Comptar backups existents
    local BACKUP_COUNT=$(find "$BACKUP_DIR" -name "territoriadf_${BACKUP_TYPE}_*.tar.gz" 2>/dev/null | wc -l)
    
    if [ "$BACKUP_COUNT" -le "$KEEP_COUNT" ]; then
        log_info "Hi ha $BACKUP_COUNT backup(s), no cal rotar"
        return 0
    fi
    
    # Eliminar backups antics (mantenir només el més recent)
    find "$BACKUP_DIR" -name "territoriadf_${BACKUP_TYPE}_*.tar.gz" -type f -printf '%T@ %p\n' | \
        sort -rn | \
        tail -n +$(($KEEP_COUNT + 1)) | \
        cut -d' ' -f2- | \
        while read OLD_BACKUP; do
            log_warning "Eliminant backup antic: $(basename "$OLD_BACKUP")"
            rm -f "$OLD_BACKUP"
        done
    
    log_success "Rotació completada"
}

check_disk_space() {
    local AVAILABLE=$(df "$PROJECT_DIR" | tail -1 | awk '{print $4}')
    local AVAILABLE_MB=$((AVAILABLE / 1024))
    
    log_info "Espai disponible: ${AVAILABLE_MB}MB"
    
    if [ "$AVAILABLE_MB" -lt 100 ]; then
        log_error "Espai en disc insuficient (< 100MB)!"
        return 1
    fi
    
    return 0
}

# ============================================
# SCRIPT PRINCIPAL
# ============================================

main() {
    local BACKUP_TYPE="${1:-daily}"
    
    # Validar tipus de backup
    if [[ ! "$BACKUP_TYPE" =~ ^(daily|weekly|monthly|semester)$ ]]; then
        log_error "Tipus de backup invàlid: $BACKUP_TYPE"
        echo "Ús: $0 [daily|weekly|monthly|semester]"
        exit 1
    fi
    
    log_info "=========================================="
    log_info "Iniciant backup $BACKUP_TYPE"
    log_info "Data: $(date '+%Y-%m-%d %H:%M:%S')"
    log_info "=========================================="
    
    # Verificacions prèvies
    check_docker
    check_container
    check_disk_space || exit 1
    
    # Verificar que existeix el directori de dades
    if [ ! -d "$DATA_DIR" ]; then
        log_error "El directori de dades no existeix: $DATA_DIR"
        exit 1
    fi
    
    # Aturar contenidor
    CONTAINER_WAS_RUNNING=false
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        CONTAINER_WAS_RUNNING=true
        stop_container || true
        sleep 2
    else
        log_info "El contenidor ja estava aturat"
    fi
    
    # Checkpoint de SQLite
    CHECKPOINT_OK=false
    if sqlite_checkpoint; then
        CHECKPOINT_OK=true
    fi
    
    # Crear backup (usa variable global CREATED_BACKUP_FILE)
    create_backup "$BACKUP_TYPE"
    BACKUP_SUCCESS=$?
    BACKUP_FILE="$CREATED_BACKUP_FILE"

    # La còpia de la BD s'envia amb el contenidor encara aturat (després del
    # checkpoint), perquè el fitxer sigui consistent.
    DB_COPY_STATUS="no enviada"
    if [ $BACKUP_SUCCESS -eq 0 ]; then
        if [ "$CHECKPOINT_OK" != true ]; then
            DB_COPY_STATUS="no enviada: el checkpoint del WAL ha fallat"
        elif send_db_copy "$BACKUP_TYPE"; then
            DB_COPY_STATUS="enviada"
        else
            DB_COPY_STATUS="no enviada: Telegram no l'ha acceptada (vegeu backup.log)"
        fi
    fi
    
    # Reiniciar contenidor si estava en marxa
    if [ "$CONTAINER_WAS_RUNNING" = true ]; then
        start_container
        sleep 3
        
        # Verificar que el contenidor està funcionant
        if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
            log_success "El contenidor està operatiu"
        else
            log_error "El contenidor no s'ha pogut reiniciar correctament!"
            send_telegram "⚠️ <b>TerritoriADF Backup ERROR</b>: El contenidor no s'ha reiniciat després del backup $BACKUP_TYPE"
        fi
    fi
    
    # Gestionar rotació
    if [ $BACKUP_SUCCESS -eq 0 ]; then
        rotate_backups "$BACKUP_TYPE"
        
        log_info "=========================================="
        log_success "Backup $BACKUP_TYPE completat amb èxit!"
        log_info "=========================================="
        
        # Notificació Telegram
        send_telegram "✅ <b>TerritoriADF Backup OK</b>
Tipus: $BACKUP_TYPE
📁 $(basename "$BACKUP_FILE")
📊 $(du -h "$BACKUP_FILE" | cut -f1)
🗄️ Còpia de la BD: $DB_COPY_STATUS
🕐 $(date '+%Y-%m-%d %H:%M:%S')"
        
        exit 0
    else
        log_error "El backup ha fallat"
        send_telegram "❌ <b>TerritoriADF Backup ERROR</b>: El backup $BACKUP_TYPE ha fallat!"
        exit 1
    fi
}

# Executar script
main "$@"
