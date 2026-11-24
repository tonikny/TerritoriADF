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
#   4. Render de mosquitto.conf de producció (fail-closed, equivalent a npm run mosquitto:render)
#   5. Neteja de node_modules antics (layout --prefix)
#   6. npm ci (lockfile de l'arrel)
#   7. docker compose build  (si falla, els contenidors no es toquen)
#   8. docker compose up -d + restart de mosquitto si la seva conf ha canviat
#   9. Espera de healthcheck de backend i frontend
#  10. npm run update:boundaries (no bloquejant: si falla, només avisa)
#  11. docker image prune + docker builder prune --filter until=168h
#
# Si una passa falla, l'script s'atura -- excepte la 10, que és best-effort.
# Les migracions de la BD s'apliquen automàticament en arrencar el contenidor
# (node dist/scripts/migrate.js).

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

MOSQUITTO_CONF_CHANGED=0
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

  # Mosquitto: el listener 51823 està publicat a 0.0.0.0 (docker-compose.yml).
  # En producció ha de servir TLS; si al servidor hi ha la conf de dev (text
  # pla), les credencials OwnTracks viatjarien desxifrades i cap `git pull`
  # ho corregiria (mosquitto.conf està ignorat per git). Falla tancat.
  local mq_conf="mosquitto/config/mosquitto.conf"
  [[ -f "$mq_conf" ]] || die "Falta $mq_conf. En producció: npm run mosquitto:render (+ certs a mosquitto/certs/)."
  grep -qE '^[[:space:]]*certfile[[:space:]]+' "$mq_conf" \
    || die "$mq_conf sense 'certfile': el port 51823 aniria en TEXT PLA. Regenera'l amb npm run mosquitto:render (producció, amb TLS)."
  grep -qE '^[[:space:]]*keyfile[[:space:]]+' "$mq_conf" \
    || die "$mq_conf sense 'keyfile': el port 51823 aniria en TEXT PLA. Regenera'l amb npm run mosquitto:render (producció, amb TLS)."
  [[ -f mosquitto/certs/fullchain.pem && -f mosquitto/certs/privkey.pem ]] \
    || die "Falten mosquitto/certs/fullchain.pem i/o privkey.pem. Copia'ls des de /etc/letsencrypt/live/<domini>/ (documentació interna: ops/mqtt.md §3)."
  if grep -qE '^[[:space:]]*OTRC_TLS[[:space:]]*=[[:space:]]*(false|0)' back/.env; then
    log_warn "back/.env porta OTRC_TLS=false: el .otrc dirà als mòbils que vagin en pla. En producció ha de ser true (o no definir-lo)."
  fi

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

render_mosquitto_config() {
  log_info "Renderitzant mosquitto.conf de producció"
  if (( DRY_RUN )); then
    echo "  [dry-run] bash scripts/render-mosquitto.sh --prod"
    return 0
  fi
  local mq_conf="mosquitto/config/mosquitto.conf"
  local old_sum="missing"
  if [[ -f "$mq_conf" ]]; then
    old_sum=$(sha256sum "$mq_conf" | cut -d' ' -f1)
  fi
  bash scripts/render-mosquitto.sh --prod >/dev/null \
    || die "No s'ha pogut renderitzar $mq_conf de producció."
  # Fail-closed: el render ja garanteix certfile/keyfile/tls_version a la
  # plantilla; aquí només cal comprovar els certs reals del host.
  [[ -f mosquitto/certs/fullchain.pem && -f mosquitto/certs/privkey.pem ]] \
    || die "Falten mosquitto/certs/fullchain.pem i/o privkey.pem. Copia'ls des de /etc/letsencrypt/live/<domini>/ (documentació interna: ops/mqtt.md §3)."
  local new_sum
  new_sum=$(sha256sum "$mq_conf" | cut -d' ' -f1)
  if [[ "$old_sum" != "$new_sum" ]]; then
    MOSQUITTO_CONF_CHANGED=1
    log_ok "mosquitto.conf actualitzat (cal reiniciar mosquitto)"
  else
    MOSQUITTO_CONF_CHANGED=0
    log_ok "mosquitto.conf sense canvis"
  fi
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

restart_mosquitto_if_needed() {
  if (( DRY_RUN )); then
    echo "  [dry-run] docker compose restart mosquitto (només si mosquitto.conf ha canviat)"
    return 0
  fi
  if (( ! MOSQUITTO_CONF_CHANGED )); then
    log_info "mosquitto.conf sense canvis; no cal reiniciar"
    return 0
  fi
  log_info "Reiniciant mosquitto amb la nova conf (bind mount: up -d no la recarrega sol)"
  docker compose restart mosquitto \
    || die "No s'ha pogut reiniciar mosquitto."
  sleep 3
  docker compose logs --tail=30 mosquitto 2>/dev/null | grep -q 'Opening .*51823' \
    || die "mosquitto reiniciat però no obre el port 51823; revisa mosquitto.conf i els certs."
  # Mosquitto 2.1.2 registra "Opening ipv4 listen socket on port 51823" tant
  # en pla com en TLS, així que l'obertura al log no prova TLS. La prova real
  # és un handshake TLS (en pla falla i no hi ha "Verify return code: 0").
  if command -v openssl >/dev/null 2>&1; then
    echo | timeout 8 openssl s_client -connect 127.0.0.1:51823 -tls1_2 2>/dev/null | grep -q 'Verify return code: 0' \
      || die "mosquitto escolta al 51823 però el handshake TLS falla; revisa mosquitto.conf i els certs."
  else
    log_warn "openssl no disponible; no es pot verificar el handshake TLS al 51823."
  fi
  log_ok "mosquitto reiniciat amb TLS al 51823"
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
    curl -fsS --max-time 10 http://127.0.0.1:3034/readyz >/dev/null \
      && log_ok "API respon a 127.0.0.1:3034 (/readyz)" \
      || { log_error "L'API no respon a 127.0.0.1:3034 (/readyz)"; return 1; }
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
  render_mosquitto_config
  clean_legacy_node_modules
  install_dependencies
  build_images
  start_services
  restart_mosquitto_if_needed
  verify_services

  # Després dels healthchecks: si això falla, el desplegament ja ha acabat bé.
  update_boundaries

  log_info "Netejant imatges sense etiqueta"
  run docker image prune -f

  # Cache de build: el GC del dimoni (builder.gc a /etc/docker/daemon.json)
  # ja el manté a ratlla on està configurat, però un servidor sense aquest
  # bloc el deixa créixer fins a un percentatge del disc. Només cau el que
  # fa més de 7 dies que no s'usa, així que els builds de cada desplegament
  # segueixen calents. Vegeu ops/deploy.md §7, «Neteja de disc de Docker».
  log_info "Netejant cache de build de més de 7 dies (until=168h)"
  run docker builder prune --filter until=168h -f

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
