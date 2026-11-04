#!/bin/bash
#
# Script de Verificació de Backups per TerritoriADF
# ==================================================
# Autor: OpenCode
# Data: 2026-06-29
#
# Ús: ./check-backups.sh
#
# Aquest script:
# - Verifica l'estat de tots els backups
# - Comprova la integritat dels fitxers
# - Mostra informació detallada sobre cada tipus de backup
# - Envia notificació per Telegram si hi ha problemes

set -e  # Sortir si hi ha errors

# ============================================
# CONFIGURACIÓ
# ============================================

# Directori base del projecte (assumeix que l'script està a scripts/backup/)
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_BASE_DIR="$PROJECT_DIR/backups"
CONTAINER_NAME="territoriadf-backend"

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
CYAN='\033[0;36m'
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

log_header() {
    echo -e "${CYAN}$1${NC}"
}

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

check_backup_type() {
    local BACKUP_TYPE="$1"
    local BACKUP_DIR="$BACKUP_BASE_DIR/$BACKUP_TYPE"
    local ISSUES=0
    
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Backup: $BACKUP_TYPE"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Verificar que existeix el directori
    if [ ! -d "$BACKUP_DIR" ]; then
        log_warning "El directori de backups no existeix: $BACKUP_DIR"
        ((ISSUES++))
        return $ISSUES
    fi
    
    # Comptar backups
    local BACKUP_FILES=($(find "$BACKUP_DIR" -name "territoriadf_${BACKUP_TYPE}_*.tar.gz" -type f 2>/dev/null))
    local BACKUP_COUNT=${#BACKUP_FILES[@]}
    
    if [ $BACKUP_COUNT -eq 0 ]; then
        log_warning "No hi ha cap backup de tipus $BACKUP_TYPE"
        ((ISSUES++))
    else
        log_success "Trobats $BACKUP_COUNT backup(s)"
        
        # Mostrar informació de cada backup
        for BACKUP_FILE in "${BACKUP_FILES[@]}"; do
            echo ""
            echo "  📦 $(basename "$BACKUP_FILE")"
            
            # Mida
            local SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
            echo "     Mida: $SIZE"
            
            # Data de creació
            local DATE=$(stat -c %y "$BACKUP_FILE" | cut -d'.' -f1)
            echo "     Data: $DATE"
            
            # Antiguitat
            local FILE_TIME=$(stat -c %Y "$BACKUP_FILE")
            local NOW_TIME=$(date +%s)
            local AGE_SECONDS=$((NOW_TIME - FILE_TIME))
            local AGE_DAYS=$((AGE_SECONDS / 86400))
            echo "     Antiguitat: $AGE_DAYS dies"
            
            # Verificar integritat
            if tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
                echo "     Integritat: ✅ OK"
            else
                log_error "     Integritat: ❌ CORRUPTE"
                ((ISSUES++))
            fi
            
            # Advertències segons el tipus i antiguitat
            case "$BACKUP_TYPE" in
                daily)
                    if [ $AGE_DAYS -gt 2 ]; then
                        log_warning "     ⚠️  El backup diari té més de 2 dies"
                        ((ISSUES++))
                    fi
                    ;;
                weekly)
                    if [ $AGE_DAYS -gt 10 ]; then
                        log_warning "     ⚠️  El backup setmanal té més de 10 dies"
                        ((ISSUES++))
                    fi
                    ;;
                monthly)
                    if [ $AGE_DAYS -gt 35 ]; then
                        log_warning "     ⚠️  El backup mensual té més de 35 dies"
                        ((ISSUES++))
                    fi
                    ;;
                semester)
                    if [ $AGE_DAYS -gt 200 ]; then
                        log_warning "     ⚠️  El backup semestral té més de 200 dies"
                        ((ISSUES++))
                    fi
                    ;;
            esac
        done
    fi
    
    return $ISSUES
}

check_disk_space() {
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Espai en Disc"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    local DF_OUTPUT=$(df -h "$PROJECT_DIR" | tail -1)
    local TOTAL=$(echo "$DF_OUTPUT" | awk '{print $2}')
    local USED=$(echo "$DF_OUTPUT" | awk '{print $3}')
    local AVAIL=$(echo "$DF_OUTPUT" | awk '{print $4}')
    local PERCENT=$(echo "$DF_OUTPUT" | awk '{print $5}' | tr -d '%')
    
    echo "  Total:      $TOTAL"
    echo "  Utilitzat:  $USED"
    echo "  Disponible: $AVAIL"
    echo "  Ús:         $PERCENT%"
    
    if [ "$PERCENT" -gt 95 ]; then
        log_error "  ⚠️  Espai crític! (> 95%)"
        return 1
    elif [ "$PERCENT" -gt 90 ]; then
        log_warning "  ⚠️  Poc espai disponible (> 90%)"
        return 1
    else
        log_success "  ✅ Espai suficient"
        return 0
    fi
}

check_cron_jobs() {
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Cron Jobs"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if crontab -l 2>/dev/null | grep -q "TerritoriADF Backups"; then
        log_success "Cron jobs instal·lats"
        
        echo ""
        echo "  Programació activa:"
        crontab -l 2>/dev/null | grep -A 10 "TerritoriADF Backups" | grep -v "^$" | sed 's/^/  /'
        
        return 0
    else
        log_warning "Cron jobs NO instal·lats"
        log_info "Executa: scripts/backup/setup-cron.sh install"
        return 1
    fi
}

check_container() {
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Contenidor Docker"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if ! command -v docker &> /dev/null; then
        log_warning "Docker no està disponible"
        return 1
    fi
    
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_success "Contenidor $CONTAINER_NAME: ✅ En execució"
        
        # Mostrar informació del contenidor
        local UPTIME=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER_NAME" 2>/dev/null | cut -d'T' -f1)
        echo "  Iniciat: $UPTIME"
        
        return 0
    elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_warning "Contenidor $CONTAINER_NAME: ⚠️  Aturat"
        return 1
    else
        log_error "Contenidor $CONTAINER_NAME: ❌ No existeix"
        return 1
    fi
}

check_backup_log() {
    local LOG_FILE="$BACKUP_BASE_DIR/backup.log"
    
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  Log de Backups"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if [ ! -f "$LOG_FILE" ]; then
        log_warning "No s'ha trobat el log de backups"
        return 1
    fi
    
    log_success "Log trobat: $LOG_FILE"
    
    local LOG_SIZE=$(du -h "$LOG_FILE" | cut -f1)
    echo "  Mida: $LOG_SIZE"
    
    echo ""
    echo "  Últimes 10 línies:"
    echo ""
    tail -n 10 "$LOG_FILE" | sed 's/^/  /'
    
    return 0
}

generate_summary() {
    local TOTAL_ISSUES="$1"
    
    echo ""
    echo ""
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log_header "  RESUM"
    log_header "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    if [ $TOTAL_ISSUES -eq 0 ]; then
        log_success "✅ Tot correcte! No s'han detectat problemes"
        send_telegram "✅ <b>Hidrants Backups Check</b>: Tot correcte!"
    else
        log_warning "⚠️  S'han detectat $TOTAL_ISSUES problema(es)"
        send_telegram "⚠️ <b>Hidrants Backups Check</b>: S'han detectat $TOTAL_ISSUES problema(es). Revisa els backups."
    fi
    
    echo ""
}

# ============================================
# SCRIPT PRINCIPAL
# ============================================

main() {
    local TOTAL_ISSUES=0
    
    echo ""
    log_header "╔════════════════════════════════════════╗"
    log_header "║   Verificació de Backups - Hidrants   ║"
    log_header "╚════════════════════════════════════════╝"
    echo ""
    log_info "Data: $(date '+%Y-%m-%d %H:%M:%S')"
    
    # Verificar contenidor Docker
    check_container || ((TOTAL_ISSUES++))
    
    # Verificar cron jobs
    check_cron_jobs || ((TOTAL_ISSUES++))
    
    # Verificar cada tipus de backup
    for BACKUP_TYPE in daily weekly monthly semester; do
        check_backup_type "$BACKUP_TYPE"
        TOTAL_ISSUES=$((TOTAL_ISSUES + $?))
    done
    
    # Verificar espai en disc
    check_disk_space || ((TOTAL_ISSUES++))
    
    # Verificar log
    check_backup_log || true
    
    # Generar resum
    generate_summary $TOTAL_ISSUES
    
    exit $TOTAL_ISSUES
}

# Executar script
main "$@"
