#!/bin/bash
#
# Script de Restauració de Backups per TerritoriADF
# ==================================================
# Autor: OpenCode
# Data: 2026-06-29
#
# Ús: ./restore.sh [daily|weekly|monthly|semester] [nom_fitxer_opcional]
#
# Aquest script:
# - Llista els backups disponibles del tipus seleccionat
# - Atura el contenidor backend
# - Fa una còpia de seguretat de les dades actuals
# - Restaura el backup seleccionat
# - Reinicia el contenidor

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

list_backups() {
    local BACKUP_TYPE="$1"
    local BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_TYPE"
    
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "No hi ha backups del tipus $BACKUP_TYPE"
        return 1
    fi
    
    local BACKUPS=($(find "$BACKUP_DIR" -name "territoriadf_${BACKUP_TYPE}_*.tar.gz" -type f | sort -r))
    
    if [ ${#BACKUPS[@]} -eq 0 ]; then
        log_error "No s'han trobat backups del tipus $BACKUP_TYPE"
        return 1
    fi
    
    echo "${BACKUPS[@]}"
}

select_backup() {
    local BACKUP_TYPE="$1"
    local SPECIFIC_FILE="$2"
    
    if [ -n "$SPECIFIC_FILE" ]; then
        # Si s'ha especificat un fitxer concret
        if [ -f "$SPECIFIC_FILE" ]; then
            echo "$SPECIFIC_FILE"
            return 0
        else
            log_error "El fitxer especificat no existeix: $SPECIFIC_FILE"
            return 1
        fi
    fi
    
    # Llistar backups disponibles
    local BACKUPS=($(list_backups "$BACKUP_TYPE"))
    
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    echo ""
    log_info "Backups disponibles de tipus $BACKUP_TYPE:"
    echo ""
    
    local i=1
    for BACKUP in "${BACKUPS[@]}"; do
        local SIZE=$(du -h "$BACKUP" | cut -f1)
        local DATE=$(basename "$BACKUP" | sed -E 's/territoriadf_.*_([0-9]{8}_[0-9]{6})\.tar\.gz/\1/' | sed 's/_/ /')
        echo "  [$i] $(basename "$BACKUP")"
        echo "      Mida: $SIZE | Data: $DATE"
        echo ""
        ((i++))
    done
    
    # Si només hi ha un backup, seleccionar-lo automàticament
    if [ ${#BACKUPS[@]} -eq 1 ]; then
        log_info "Només hi ha un backup disponible, seleccionant automàticament..."
        echo "${BACKUPS[0]}"
        return 0
    fi
    
    # Demanar a l'usuari que seleccioni
    echo -n "Selecciona el backup a restaurar [1-${#BACKUPS[@]}] o [q] per cancel·lar: "
    read SELECTION
    
    if [ "$SELECTION" = "q" ] || [ "$SELECTION" = "Q" ]; then
        log_warning "Restauració cancel·lada per l'usuari"
        exit 0
    fi
    
    if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt ${#BACKUPS[@]} ]; then
        log_error "Selecció invàlida"
        return 1
    fi
    
    echo "${BACKUPS[$((SELECTION-1))]}"
}

confirm_restore() {
    local BACKUP_FILE="$1"
    
    echo ""
    log_warning "=========================================="
    log_warning "ATENCIÓ: Aquesta operació és DESTRUCTIVA"
    log_warning "=========================================="
    echo ""
    log_warning "Es restaurarà el backup:"
    log_warning "  $(basename "$BACKUP_FILE")"
    echo ""
    log_warning "Les dades actuals es mourà a:"
    log_warning "  $DATA_DIR.backup_$TIMESTAMP"
    echo ""
    echo -n "Estàs segur que vols continuar? [sí/NO]: "
    read CONFIRM
    
    if [ "$CONFIRM" != "sí" ] && [ "$CONFIRM" != "si" ]; then
        log_warning "Restauració cancel·lada per l'usuari"
        exit 0
    fi
}

backup_current_data() {
    local BACKUP_DIR="$DATA_DIR.backup_$TIMESTAMP"
    
    log_info "Fent còpia de seguretat de les dades actuals..."
    
    if [ ! -d "$DATA_DIR" ]; then
        log_warning "El directori de dades no existeix, saltant backup"
        return 0
    fi
    
    if cp -a "$DATA_DIR" "$BACKUP_DIR"; then
        log_success "Dades actuals guardades a: $BACKUP_DIR"
        echo "$BACKUP_DIR"
        return 0
    else
        log_error "Error fent còpia de seguretat de les dades actuals"
        return 1
    fi
}

restore_backup() {
    local BACKUP_FILE="$1"
    
    log_info "Restaurant backup..."
    
    # Eliminar dades actuals
    if [ -d "$DATA_DIR" ]; then
        rm -rf "$DATA_DIR"
        log_success "Dades actuals eliminades"
    fi
    
    # Extreure backup
    if tar -xzf "$BACKUP_FILE" -C "$(dirname "$DATA_DIR")" 2>/dev/null; then
        log_success "Backup restaurat correctament"
        return 0
    else
        log_error "Error restaurant el backup"
        return 1
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

# ============================================
# SCRIPT PRINCIPAL
# ============================================

main() {
    local BACKUP_TYPE="${1:-}"
    local SPECIFIC_FILE="${2:-}"
    
    if [ -z "$BACKUP_TYPE" ]; then
        log_error "Has d'especificar el tipus de backup"
        echo "Ús: $0 [daily|weekly|monthly|semester] [nom_fitxer_opcional]"
        exit 1
    fi
    
    # Validar tipus de backup
    if [[ ! "$BACKUP_TYPE" =~ ^(daily|weekly|monthly|semester)$ ]]; then
        log_error "Tipus de backup invàlid: $BACKUP_TYPE"
        echo "Ús: $0 [daily|weekly|monthly|semester] [nom_fitxer_opcional]"
        exit 1
    fi
    
    log_info "=========================================="
    log_info "Restauració de backup $BACKUP_TYPE"
    log_info "Data: $(date '+%Y-%m-%d %H:%M:%S')"
    log_info "=========================================="
    echo ""
    
    # Verificacions prèvies
    check_docker
    check_container
    
    # Seleccionar backup
    BACKUP_FILE=$(select_backup "$BACKUP_TYPE" "$SPECIFIC_FILE")
    if [ $? -ne 0 ]; then
        exit 1
    fi
    
    # Confirmar restauració
    confirm_restore "$BACKUP_FILE"
    
    echo ""
    log_info "Iniciant procés de restauració..."
    echo ""
    
    # Aturar contenidor
    CONTAINER_WAS_RUNNING=false
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        CONTAINER_WAS_RUNNING=true
        stop_container || true
        sleep 2
    else
        log_info "El contenidor ja estava aturat"
    fi
    
    # Backup de dades actuals
    CURRENT_BACKUP=$(backup_current_data)
    if [ $? -ne 0 ]; then
        log_error "No s'ha pogut fer backup de les dades actuals. Abortant."
        if [ "$CONTAINER_WAS_RUNNING" = true ]; then
            start_container
        fi
        exit 1
    fi
    
    # Restaurar backup
    if restore_backup "$BACKUP_FILE"; then
        log_success "Restauració completada amb èxit!"
        
        # Reiniciar contenidor si estava en marxa
        if [ "$CONTAINER_WAS_RUNNING" = true ]; then
            start_container
            sleep 3
            
            # Verificar que el contenidor està funcionant
            if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
                log_success "El contenidor està operatiu"
            else
                log_error "El contenidor no s'ha pogut reiniciar correctament!"
            fi
        fi
        
        echo ""
        log_info "=========================================="
        log_success "Restauració completada!"
        log_info "=========================================="
        echo ""
        log_info "Les dades anteriors s'han guardat a:"
        log_info "  $CURRENT_BACKUP"
        echo ""
        
        exit 0
    else
        log_error "La restauració ha fallat!"
        
        # Intentar restaurar les dades originals
        if [ -n "$CURRENT_BACKUP" ] && [ -d "$CURRENT_BACKUP" ]; then
            log_warning "Intentant restaurar les dades originals..."
            rm -rf "$DATA_DIR"
            mv "$CURRENT_BACKUP" "$DATA_DIR"
            log_info "Dades originals restaurades"
        fi
        
        # Reiniciar contenidor
        if [ "$CONTAINER_WAS_RUNNING" = true ]; then
            start_container
        fi
        
        exit 1
    fi
}

# Executar script
main "$@"
