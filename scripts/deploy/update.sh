#!/usr/bin/env bash
#
# Actualització segura del desplegament (TerritoriADF)
# ====================================================
#
# Ús: npm run docker:deploy -- [opcions]
#     bash scripts/deploy/update.sh [opcions]
#
# Opcions:
#   --yes             No demanar confirmació
#   --allow-dirty     Permetre canvis locals (git pull --autostash)
#   --skip-backup     No fer la còpia prèvia de back/data (NO recomanat)
#   --no-boundaries   Ometre `npm run update:boundaries` (per defecte s'executa)
#   --dry-run         Mostrar les passes sense executar-les
#   -h, --help        Aquesta ajuda
#
# Ordre de les passes:
#   1. Comprovacions prèvies (git, docker, .env)
#   2. Còpia de seguretat de back/data a backups/pre-deploy/
#   3. git pull --ff-only
#   4. Neteja de node_modules antics (layout --prefix)
#   5. npm ci (lockfile de l'arrel)
#   6. docker compose build  (si falla, els contenidors no es toquen)
#   7. docker compose up -d
#   8. Espera de healthcheck de backend i frontend
#   9. npm run update:boundaries (no bloquejant: si falla, només avisa)
#  10. docker image prune
#
# Si una passa falla, l'script s'atura -- excepte la 9, que és best-effort.
# Les migracions de la BD s'apliquen automàticament en arrencar el contenidor
# (node dist/scripts/migrate.js).

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

BACKEND_CONTAINER="territoriadf-backend"
FRONTEND_CONTAINER="territoriadf-frontend"
DATA_DIR="$PROJECT_DIR/back/data"
BACKUP_DIR="$PROJECT_DIR/backups/pre-deploy"
KEEP_BACKUPS=5
HEALTH_TIMEOUT=180

ASSUME_YES=0
ALLOW_DIRTY=0
SKIP_BACKUP=0
SKIP_BOUNDARIES=0
DRY_RUN=0
PREV_COMMIT="desconegut"
BACKUP_FILE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

die() {
  log_error "$1"
  exit 1
}

on_error() {
  local line="$1"
  log_error "Actualització aturada a la línia $line. Els contenidors en marxa NO s'han tocat si encara érem a la fase de build."
  log_error "Per revertir: git reset --hard $PREV_COMMIT && docker compose up -d --build"
}
trap 'on_error $LINENO' ERR

# Executa un comandament respectant --dry-run.
run() {
  if (( DRY_RUN )); then
    echo "  [dry-run] $*"
  else
    "$@"
  fi
}

usage() {
  sed -n '2,/^$/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    --no-boundaries) SKIP_BOUNDARIES=1 ;;
    --boundaries) SKIP_BOUNDARIES=0 ;; # compatibilitat: ara és el comportament per defecte
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage ;;
    *) die "Opció desconeguda: $1 (usa --help)" ;;
  esac
  shift
done

confirm() {
  (( ASSUME_YES )) && return 0
  local answer
  read -r -p "$1 [s/N] " answer
  [[ "$answer" =~ ^[sS]$ ]] || die "Cancel·lat per l'usuari."
}

# ---------------------------------------------------------------- comprovacions

check_prerequisites() {
  log_info "Comprovacions prèvies"

  [[ -f package-lock.json ]] || die "Falta package-lock.json a l'arrel."
  [[ -f back/.env ]] || die "Falta back/.env (necessari per als contenidors)."
  command -v docker >/dev/null || die "Docker no està instal·lat."
  command -v npm >/dev/null || die "npm no és al PATH (amb fnm: eval \"\$(fnm env)\")."
  docker compose version >/dev/null 2>&1 || die "docker compose no està disponible."
  docker info >/dev/null 2>&1 || die "No es pot connectar amb el dimoni de Docker."
  git rev-parse --git-dir >/dev/null 2>&1 || die "Aquest directori no és un repositori git."

  [[ -d "$DATA_DIR" ]] || log_warn "No existeix $DATA_DIR (desplegament inicial?)"

  # Claus de .env.example que falten a .env: només avís, no atura res.
  if [[ -f back/.env.example ]]; then
    local missing
    missing=$(comm -23 \
      <(grep -oE '^[A-Z_][A-Z0-9_]*=' back/.env.example | tr -d '=' | sort -u) \
      <(grep -oE '^[A-Z_][A-Z0-9_]*=' back/.env | tr -d '=' | sort -u))
    if [[ -n "$missing" ]]; then
      log_warn "Variables a back/.env.example que no són a back/.env:"
      echo "$missing" | sed 's/^/    /'
    fi
  fi

  log_ok "Entorn correcte"
}

check_git() {
  local branch dirty
  branch=$(git rev-parse --abbrev-ref HEAD)
  PREV_COMMIT=$(git rev-parse HEAD)

  log_info "Branca: $branch  Commit actual: ${PREV_COMMIT:0:12}"

  dirty=$(git status --porcelain)
  if [[ -n "$dirty" ]]; then
    echo "$dirty" | sed 's/^/    /'
    if (( ALLOW_DIRTY )); then
      log_warn "Hi ha canvis locals; s'usarà git pull --ff-only --autostash"
    elif (( DRY_RUN )); then
      log_warn "Hi ha canvis locals (en mode dry-run no atura l'execució)."
    else
      die "Hi ha canvis locals. Fes commit/stash, o passa --allow-dirty si saps què són."
    fi
  fi

  log_info "Consultant el remot..."
  run git fetch --quiet
  if (( DRY_RUN )); then
    log_info "[dry-run] saltant la llista de commits nous"
    NEW_COMMITS=0
    return 0
  fi

  git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1 \
    || die "La branca '$branch' no té upstream configurat."

  NEW_COMMITS=$(git rev-list --count "HEAD..@{u}")
  if (( NEW_COMMITS == 0 )); then
    log_ok "Ja estàs a l'últim commit del remot; es reconstruirà igualment."
  else
    log_info "$NEW_COMMITS commit(s) nous al remot:"
    git log --oneline "HEAD..@{u}" | sed 's/^/    /'
  fi
}

# ---------------------------------------------------------------- còpia prèvia

create_predeploy_backup() {
  if (( SKIP_BACKUP )); then
    log_warn "Còpia prèvia omesa (--skip-backup)."
    return 0
  fi
  if [[ ! -d "$DATA_DIR" ]]; then
    log_warn "No hi ha $DATA_DIR; no es fa còpia prèvia."
    return 0
  fi

  local stamp file rc=0 was_running=0
  stamp=$(date +%Y%m%d_%H%M%S)
  file="$BACKUP_DIR/territoriadf_predeploy_${stamp}.tar.gz"
  BACKUP_FILE="$file"

  run mkdir -p "$BACKUP_DIR"

  if docker ps --format '{{.Names}}' | grep -qx "$BACKEND_CONTAINER"; then
    was_running=1
    log_info "Aturant $BACKEND_CONTAINER per una còpia coherent..."
    run docker stop "$BACKEND_CONTAINER" >/dev/null
    (( DRY_RUN )) || sleep 2
  fi

  local db_file="$DATA_DIR/territoriadf.db"
  # Compatibilitat: un servidor on el backend encara no s'ha reiniciat conserva el nom vell.
  [[ -f "$db_file" ]] || db_file="$DATA_DIR/hidrants.db"
  if command -v sqlite3 >/dev/null && [[ -f "$db_file" ]]; then
    run sqlite3 "$db_file" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true
  fi

  log_info "Creant còpia prèvia a $file"
  if (( DRY_RUN )); then
    echo "  [dry-run] tar -czf $file -C $PROJECT_DIR back/data"
  else
    tar -czf "$file" -C "$PROJECT_DIR" back/data || rc=$?
  fi

  if (( was_running )); then
    log_info "Reiniciant $BACKEND_CONTAINER..."
    run docker start "$BACKEND_CONTAINER" >/dev/null
    (( DRY_RUN )) || sleep 3
  fi

  if (( rc != 0 )); then
    log_error "La còpia prèvia ha fallat; no es continua."
    return 1
  fi

  if (( DRY_RUN )); then
    log_ok "[dry-run] còpia prèvia simulada"
  else
    log_ok "Còpia prèvia creada ($(du -h "$file" | cut -f1))"
    # Rotació: es conserven les KEEP_BACKUPS més recents.
    find "$BACKUP_DIR" -name 'territoriadf_predeploy_*.tar.gz' -type f -printf '%T@ %p\n' \
      | sort -rn | tail -n +$((KEEP_BACKUPS + 1)) | cut -d' ' -f2- \
      | while read -r old; do
          log_info "Eliminant còpia antiga: $(basename "$old")"
          rm -f "$old"
        done
  fi
}

# ---------------------------------------------------------------- actualització

pull_changes() {
  log_info "Actualitzant el codi (git pull --ff-only)"
  if (( ALLOW_DIRTY )); then
    run git pull --ff-only --autostash
  else
    run git pull --ff-only
  fi
  if (( DRY_RUN )); then
    return 0
  fi
  log_ok "Codi actualitzat a $(git rev-parse --short HEAD)"
}

clean_legacy_node_modules() {
  # El desplegament antic (commit 4a00f01 i anteriors) instal·lava amb
  # --prefix back/front, deixant node_modules dins de cada paquet. Amb
  # workspaces, aquests directoris poden ombrejar les dependències noves.
  local dir moved=0
  for dir in back front; do
    if [[ -d "$dir/node_modules" ]]; then
      log_info "Netejant node_modules antic de $dir/ (layout --prefix)"
      run rm -rf "$dir/node_modules"
      moved=1
    fi
  done
  (( moved )) || log_info "Cap node_modules antic dins de back/ ni front/."
}

install_dependencies() {
  log_info "Instal·lant dependències amb el lockfile (npm ci)"
  if ! run npm ci --no-audit --no-fund; then
    log_error "npm ci ha fallat. Si el lockfile i els package.json no quadren, revisa-ho abans de reintentar."
    return 1
  fi
  (( DRY_RUN )) || log_ok "Dependències instal·lades"
}

build_images() {
  log_info "Construint imatges (els contenidors actuals segueixen en marxa)"
  run docker compose build
  (( DRY_RUN )) || log_ok "Imatges construïdes"
}

start_services() {
  log_info "Aplicant la nova versió"
  run docker compose up -d
  (( DRY_RUN )) || log_ok "Contenidors recreats"
}

wait_for() {
  local name="$1" timeout="$2" elapsed=0 status
  if (( DRY_RUN )); then
    echo "  [dry-run] esperant que $name estigui sa"
    return 0
  fi
  while (( elapsed < timeout )); do
    status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo missing)
    case "$status" in
      healthy|running)
        log_ok "$name: $status"
        return 0
        ;;
      unhealthy|exited|dead|missing)
        log_error "$name: $status"
        return 1
        ;;
    esac
    sleep 3
    elapsed=$((elapsed + 3))
  done
  log_error "$name no ha arribat a estat saludable en ${timeout}s"
  return 1
}

verify_services() {
  log_info "Esperant els healthchecks (fins a ${HEALTH_TIMEOUT}s)"
  if ! wait_for "$BACKEND_CONTAINER" "$HEALTH_TIMEOUT"; then
    log_error "Logs del backend:"
    docker compose logs --tail=80 backend || true
    return 1
  fi
  if ! wait_for "$FRONTEND_CONTAINER" 60; then
    log_error "Logs del frontend:"
    docker compose logs --tail=40 frontend || true
    return 1
  fi

  if (( DRY_RUN )); then
    return 0
  fi
  if command -v curl >/dev/null; then
    curl -fsS --max-time 10 http://127.0.0.1:3034/api/adfs >/dev/null \
      && log_ok "API respon a 127.0.0.1:3034" \
      || { log_error "L'API no respon a 127.0.0.1:3034"; return 1; }
    curl -fsS --max-time 10 http://127.0.0.1:8080/ >/dev/null \
      && log_ok "Frontend respon a 127.0.0.1:8080" \
      || { log_error "El frontend no respon a 127.0.0.1:8080"; return 1; }
  fi
}

# ---------------------------------------------------------------- fronteres

update_boundaries() {
  # Best-effort: depèn de la disponibilitat d'OSM/Nominatim, així que un
  # error aquí no ha de tombar un desplegament que ja ha anat bé.
  if (( SKIP_BOUNDARIES )); then
    log_info "Fronteres omeses (--no-boundaries)"
    return 0
  fi

  log_info "Actualitzant fronteres des d'OSM (Overpass/Nominatim)"
  if (( DRY_RUN )); then
    echo "  [dry-run] npm run update:boundaries"
    return 0
  fi

  local rc=0
  npm run update:boundaries || rc=$?
  if (( rc != 0 )); then
    log_warn "L'actualització de fronteres ha fallat (codi $rc)."
    log_warn "El desplegament continua; les fronteres actuals es mantenen."
    log_warn "Per reintentar-ho més tard: npm run update:boundaries"
    return 0
  fi
  log_ok "Fronteres actualitzades"
}

# ---------------------------------------------------------------- principal

main() {
  log_info "=========================================="
  log_info "Actualització del desplegament"
  log_info "Data: $(date '+%Y-%m-%d %H:%M:%S')"
  log_info "=========================================="

  check_prerequisites
  check_git

  if (( ! ASSUME_YES )); then
    confirm "Actualitzar el desplegament ($NEW_COMMITS commit(s) nous)?"
  fi

  create_predeploy_backup
  pull_changes
  clean_legacy_node_modules
  install_dependencies
  build_images
  start_services
  verify_services

  # Després dels healthchecks: si això falla, el desplegament ja ha acabat bé.
  update_boundaries

  log_info "Netejant imatges sense etiqueta"
  run docker image prune -f

  if (( DRY_RUN )); then
    log_ok "[dry-run] cap canvi aplicat"
    exit 0
  fi

  log_info "=========================================="
  log_ok "Desplegament completat"
  log_info "Commit anterior: ${PREV_COMMIT:0:12}"
  log_info "Commit actual:   $(git rev-parse --short HEAD)"
  [[ -n "${BACKUP_FILE:-}" ]] && log_info "Còpia prèvia:    $BACKUP_FILE"
  log_info "=========================================="
  log_info "Si cal revertir:"
  log_info "  git reset --hard ${PREV_COMMIT:0:12}"
  log_info "  docker compose up -d --build"
  log_info "  # Si les migracions ja s'han aplicat, restaura també la BD:"
  log_info "  ./scripts/backup/restore.sh daily   (o el fitxer de backups/pre-deploy/)"
}

main "$@"
