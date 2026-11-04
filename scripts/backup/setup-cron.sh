#!/bin/bash
#
# Script de Configuració de Cron Jobs per Backups Automàtics
# ===========================================================
# Autor: OpenCode
# Data: 2026-06-29
#
# Ús: ./setup-cron.sh [install|uninstall|status]
#
# Aquest script configura els cron jobs per executar backups automàtics:
# - Backup diari a les 3:00 AM
# - Backup setmanal els diumenges a les 3:30 AM
# - Backup mensual el dia 1 de cada mes a les 4:00 AM
# - Backup semestral el 1 de gener i 1 de juliol a les 4:30 AM

set -e  # Sortir si hi ha errors

# ============================================
# CONFIGURACIÓ
# ============================================

# Directori base del projecte (assumeix que l'script està a scripts/backup/)
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_SCRIPT="$PROJECT_DIR/scripts/backup/backup.sh"
CRON_MARKER="# TerritoriADF Backups"

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

check_prerequisites() {
    # Verificar que el script de backup existeix
    if [ ! -f "$BACKUP_SCRIPT" ]; then
        log_error "El script de backup no existeix: $BACKUP_SCRIPT"
        exit 1
    fi
    
    # Verificar que té permisos d'execució
    if [ ! -x "$BACKUP_SCRIPT" ]; then
        log_error "El script de backup no té permisos d'execució"
        log_info "Executa: chmod +x $BACKUP_SCRIPT"
        exit 1
    fi
    
    log_success "Script de backup trobat i executable"
}

get_current_crontab() {
    crontab -l 2>/dev/null || echo ""
}

has_backup_crons() {
    get_current_crontab | grep -q "$CRON_MARKER"
}

install_crons() {
    log_info "Instal·lant cron jobs per backups automàtics..."
    
    # Verificar si ja existeixen
    if has_backup_crons; then
        log_warning "Els cron jobs ja estan instal·lats"
        echo ""
        echo -n "Vols reinstal·lar-los? [sí/NO]: "
        read CONFIRM
        
        if [ "$CONFIRM" != "sí" ] && [ "$CONFIRM" != "si" ]; then
            log_info "Instal·lació cancel·lada"
            exit 0
        fi
        
        uninstall_crons_silent
    fi
    
    # Crear fitxer temporal amb el crontab actual
    TEMP_CRON=$(mktemp)
    get_current_crontab > "$TEMP_CRON"
    
    # Afegir les noves línies
    cat >> "$TEMP_CRON" << EOF

$CRON_MARKER
# Backup diari a les 3:00 AM
0 3 * * * $BACKUP_SCRIPT daily >> $PROJECT_DIR/backups/backup.log 2>&1

# Backup setmanal els diumenges a les 3:30 AM
30 3 * * 0 $BACKUP_SCRIPT weekly >> $PROJECT_DIR/backups/backup.log 2>&1

# Backup mensual el dia 1 de cada mes a les 4:00 AM
0 4 1 * * $BACKUP_SCRIPT monthly >> $PROJECT_DIR/backups/backup.log 2>&1

# Backup semestral el 1 de gener i 1 de juliol a les 4:30 AM
30 4 1 1,7 * $BACKUP_SCRIPT semester >> $PROJECT_DIR/backups/backup.log 2>&1

EOF
    
    # Instal·lar el nou crontab
    if crontab "$TEMP_CRON"; then
        log_success "Cron jobs instal·lats correctament!"
        rm -f "$TEMP_CRON"
        
        echo ""
        log_info "Programació de backups:"
        echo "  • Diari:     Cada dia a les 3:00 AM"
        echo "  • Setmanal:  Cada diumenge a les 3:30 AM"
        echo "  • Mensual:   Cada dia 1 a les 4:00 AM"
        echo "  • Semestral: 1 de gener i 1 de juliol a les 4:30 AM"
        echo ""
        log_info "Logs es guardaran a: $PROJECT_DIR/backups/backup.log"
        echo ""
        
        return 0
    else
        log_error "Error instal·lant els cron jobs"
        rm -f "$TEMP_CRON"
        return 1
    fi
}

uninstall_crons_silent() {
    # Crear fitxer temporal amb el crontab filtrat
    TEMP_CRON=$(mktemp)
    get_current_crontab | grep -v "$CRON_MARKER" | grep -v "$BACKUP_SCRIPT" > "$TEMP_CRON"
    
    # Instal·lar el crontab net
    crontab "$TEMP_CRON"
    rm -f "$TEMP_CRON"
}

uninstall_crons() {
    log_info "Desinstal·lant cron jobs de backups..."
    
    # Verificar si existeixen
    if ! has_backup_crons; then
        log_warning "Els cron jobs no estan instal·lats"
        exit 0
    fi
    
    uninstall_crons_silent
    
    log_success "Cron jobs desinstal·lats correctament!"
}

show_status() {
    log_info "Estat dels cron jobs de backups:"
    echo ""
    
    if has_backup_crons; then
        log_success "Els cron jobs estan instal·lats"
        echo ""
        echo "Cron jobs actius:"
        echo ""
        get_current_crontab | grep -A 10 "$CRON_MARKER" | grep -v "^$"
        echo ""
        
        # Mostrar informació sobre backups existents
        if [ -d "$PROJECT_DIR/backups" ]; then
            echo ""
            log_info "Backups existents:"
            echo ""
            
            for TYPE in daily weekly monthly semester; do
                local BACKUP_DIR="$PROJECT_DIR/backups/$TYPE"
                if [ -d "$BACKUP_DIR" ]; then
                    local COUNT=$(find "$BACKUP_DIR" -name "*.tar.gz" 2>/dev/null | wc -l)
                    if [ $COUNT -gt 0 ]; then
                        local LAST_BACKUP=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
                        if [ -n "$LAST_BACKUP" ]; then
                            local SIZE=$(du -h "$LAST_BACKUP" | cut -f1)
                            local DATE=$(stat -c %y "$LAST_BACKUP" | cut -d'.' -f1)
                            printf "  %-10s %d backup(s) | Últim: %s (%s)\n" "$TYPE:" "$COUNT" "$DATE" "$SIZE"
                        fi
                    else
                        printf "  %-10s Cap backup\n" "$TYPE:"
                    fi
                else
                    printf "  %-10s Cap backup\n" "$TYPE:"
                fi
            done
            echo ""
            
            # Mostrar log si existeix
            if [ -f "$PROJECT_DIR/backups/backup.log" ]; then
                echo ""
                log_info "Últimes línies del log:"
                echo ""
                tail -n 5 "$PROJECT_DIR/backups/backup.log"
                echo ""
            fi
        fi
        
    else
        log_warning "Els cron jobs NO estan instal·lats"
        echo ""
        log_info "Executa '$0 install' per instal·lar-los"
    fi
}

test_backup() {
    log_info "Executant un test de backup diari..."
    echo ""
    
    if [ ! -x "$BACKUP_SCRIPT" ]; then
        log_error "El script de backup no és executable"
        exit 1
    fi
    
    log_info "Executant: $BACKUP_SCRIPT daily"
    echo ""
    
    "$BACKUP_SCRIPT" daily
    
    echo ""
    log_success "Test de backup completat!"
}

show_help() {
    echo "Script de Configuració de Cron Jobs per Backups Automàtics"
    echo ""
    echo "Ús: $0 [comando]"
    echo ""
    echo "Comandos disponibles:"
    echo "  install    Instal·la els cron jobs per backups automàtics"
    echo "  uninstall  Desinstal·la els cron jobs"
    echo "  status     Mostra l'estat dels cron jobs i backups"
    echo "  test       Executa un backup de prova"
    echo "  help       Mostra aquesta ajuda"
    echo ""
    echo "Programació de backups:"
    echo "  • Diari:     Cada dia a les 3:00 AM"
    echo "  • Setmanal:  Cada diumenge a les 3:30 AM"
    echo "  • Mensual:   Cada dia 1 a les 4:00 AM"
    echo "  • Semestral: 1 de gener i 1 de juliol a les 4:30 AM"
    echo ""
}

# ============================================
# SCRIPT PRINCIPAL
# ============================================

main() {
    local COMMAND="${1:-status}"
    
    case "$COMMAND" in
        install)
            check_prerequisites
            install_crons
            ;;
        uninstall)
            uninstall_crons
            ;;
        status)
            show_status
            ;;
        test)
            check_prerequisites
            test_backup
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "Comando desconegut: $COMMAND"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# Executar script
main "$@"
