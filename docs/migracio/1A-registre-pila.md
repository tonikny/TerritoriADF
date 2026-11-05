# 1A — Registre de la migració de pila (feta)

> **Temporal.** Dades reals d'aquesta migració; s'esborra abans del merge.
> Els passos genèrics i el perquè són a [`../MIGRATION.md`](../MIGRATION.md).

## Resum

Pas de la pila `hidrants` a la pila `territoriadf` **mantenint el domini
`hidrants.hopto.org`** i els certificats (el canvi de domini és la fase 1B). Un sol commit a la branca
`60-migracio-nom-aplicacio` (`f4fbd59`, 2026-11-04), 38 fitxers, +543/−152.

- Durada de la parada: 30–90 s (el build es va fer amb l'app antiga servint).
- Cap canvi d'esquema: `git diff --name-only origin/main...HEAD -- back/drizzle back/src/db` buit.
- `JWT_SECRET`, `ENCRYPTION_SECRET` i contrasenyes MQTT intactes.
- Incidències: cap registrada.

## Seqüència executada

```bash
# 1. Publicar la branca (desenvolupament)
git push -u origin 60-migracio-nom-aplicacio
#    PR: des de la web o amb gh — al servidor no hi ha gh instal·lat
gh pr create --draft --base main --head 60-migracio-nom-aplicacio

# 2. Inventari (servidor, només lectura)
#    export PROJECT_DIR=/ruta/al/repo   # la carpeta del repo al servidor
cd "$PROJECT_DIR"
git rev-parse HEAD          # 796e4e5 → commit de rollback
docker compose ls -a        # projecte hidrants
docker ps -a --format 'table {{.Names}}\t{{.Image}}'
grep -E '^(BASE_DOMAIN_URL|OTRC_HOST)=' back/.env

# 3. Backup amb els scripts antics (encara amb el codi de main)
./scripts/backup/backup.sh daily            # → hidrants_daily_*.tar.gz
tar -czf "backups/pre-deploy/manual-pre-1A-$(date +%F_%H%M).tar.gz" back/data
cp -p back/.env back/.env.pre-1A && chmod 600 back/.env.pre-1A

# 4. .env
#   BASE_DOMAIN_URL=hidrants.hopto.org

# 5. Codi i build sense aturar res
git fetch origin
git switch -c 60-migracio-nom-aplicacio --track origin/60-migracio-nom-aplicacio
npm ci --no-audit --no-fund
docker compose build

# 6. Aturar la pila antiga (projecte hidrants, encara que el fitxer nou digui territoriadf)
docker compose -p hidrants down

# 7. Aixecar
docker compose up -d

# 8. Verificar
curl -fsS http://127.0.0.1:3034/api/adfs >/dev/null
curl -fsS https://hidrants.hopto.org/api/config

# 9. Backups i cron
cd backups && for f in */*.tar.gz; do
  [ -e "$f" ] || continue
  mv "$f" "$(dirname "$f")/$(basename "$f" | sed 's/^hidrants_/territoriadf_/')"
done
cd .. && ./scripts/backup/setup-cron.sh install
./scripts/backup/backup.sh daily && ./scripts/backup/check-backups.sh
```

## Verificacions fetes

- [x] `docker compose ps`: `territoriadf-backend`, `territoriadf-frontend` i
      `territoriadf-mosquitto` en marxa; backend i frontend `healthy`.
- [x] `/api/adfs` per `127.0.0.1:3034` i `/api/config` pel domini.
- [x] Login sense tornar a entrar (cookie host-only + `JWT_SECRET` intacte).
- [x] Mapa, hidrants i incidències amb dades reals.
- [x] `.otrc` amb `host: hidrants.hopto.org` (valida el pas 4).
- [x] Unitat OwnTracks publicant; usuaris de DynSec conservats.
- [x] Telegram sense tocar: el webhook apunta al mateix domini.
- [x] Backups renombrats i cron reinstal·lat amb marcador `# TerritoriADF Backups`.
- [x] `npm run typecheck`, `npm run lint` i build verds; `docker compose config -q` vàlid.

## Ancoratge de rollback

- Commit: `796e4e5`.
- Backup: `backups/daily/territoriadf_daily_<data>.tar.gz` (abans del renombrat,
  `hidrants_daily_<data>.tar.gz`) i `backups/pre-deploy/manual-pre-1A-<data>.tar.gz`.
- `.env` previ: `back/.env.pre-1A`.
- Imatges `hidrants-*` conservades a propòsit fins que la 1B estigui validada.

```bash
docker compose -p territoriadf down
git switch --detach 796e4e5
docker compose up -d
```

## Notes per a la 1B

- `BASE_DOMAIN_URL` ja és explícit a `back/.env`; no cal tocar-lo més que per
  posar-hi el domini nou.
- Els backups nous ja són `territoriadf_*`; no cal tornar a renombrar res.
- `OTRC_HOST`: si existia, apuntava a `hidrants.hopto.org`; a la 1B s'esborra o
  s'actualitza.
- El domini nou de la 1B és `territoriadf.hopto.org`, **no** l'actual: fins al
  tall, tot el que es prova ha de ser contra `hidrants.hopto.org`.
