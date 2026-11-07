# Guia de Deploy en Producció (DEPLOY.md)

Aquesta guia detalla el procés per fer el deploy de TerritoriADF en un entorn de producció utilitzant Docker.

Si és el primer desplegament (o el primer després d'un canvi de seguretat), segueix la **checklist de §10** abans i després de pujar la versió.

## 1. Requisits del Sistema

- **SO:** Debian 13 (Trixie) recomanat, o qualsevol distribució Linux compatible amb Docker.
- **Docker** i **Docker Compose**.
- **Node.js** i **npm** instal·lats al host (només per a la inicialització de dades).

## 2. Preparació del Servidor

Si utilitzes un servidor Debian 13 net i tens els scripts preparats, pots fer-los servir. Aquests scripts (`scripts/docker_setup_debian13.sh`, `scripts/security/`) són locals del servidor i **no es versionen**, així que un clon net no els inclou: si no els tens, instal·la Docker i el proxy/seguretat amb la documentació de cada eina; la resta d'aquesta guia no en depèn.

1.  **Instal·lar Docker:**
    ```bash
    bash scripts/docker_setup_debian13.sh
    ```
2.  **Configurar Seguretat (CrowdSec, firewall):**
    ```bash
    bash scripts/security/setup-security.sh
    ```

## 3. Configuració del Projecte

`PROJECT_DIR` és la carpeta on viu el repo. No està hardcodejada enlloc del codi: els scripts la calculen a partir de la seva posició. Defineix-la una vegada al shell per a les comandes d'aquesta guia:

```bash
export PROJECT_DIR=/ruta/al/repo   # la carpeta on clonaràs el repositori
```

1.  Clona el repositori al servidor:

    ```bash
    git clone <url-del-repositori> "$PROJECT_DIR"
    cd "$PROJECT_DIR"
    ```

2.  Configura les variables d'entorn del backend:

    ```bash
    cp back/.env.example back/.env
    nano back/.env
    ```

    **IMPORTANT:**
    - Canvia `JWT_SECRET` per una clau realment segura.
    - Defineix `BASE_DOMAIN_URL` amb el domini públic (sense `https://`).
    - Revisa els ports (per defecte el backend escolta al 3033 internament).
    - Configura les claus de Telegram i GraphHopper si les tens.
    - Per a la sincronització push a OSM, configura `OSM_ACCESS_TOKEN` (token OAuth 2.0, veure secció OSM a continuació).

3.  Configura les variables d'entorn de Mosquitto:
    ```bash
    nano back/.env
    ```
    `MQTT_ADMIN_PASSWORD` i `MQTT_BACKEND_PASSWORD` (al mateix `back/.env`) les fa servir l'script de Dynamic Security. Mosquitto no necessita fitxer `.env` propi.

## 4. Inicialització de Dades (Host)

Per tal que el volum de Docker ja tingui les dades carregades, farem el setup inicial des del host:

1.  Instal·la dependències mínimes (des de l'arrel, amb workspaces):

    ```bash
    npm ci
    ```

2.  Executa el setup de la base de dades i importació d'OSM:
    ```bash
    npm run db:setup
    ```
    (`db:setup` encadena `db:reset`, `db:seed`, `db:import-osm` i `update:boundaries`.)
    Això crearà el fitxer `back/data/territoriadf.db` amb tota la informació inicial.

## 5. Deploy amb Docker Compose

1.  **Construir les imatges:**

    ```bash
    npm run docker:build
    ```

    Les imatges s'instal·len amb el `package-lock.json` de l'arrel (`npm ci -w back` / `-w front`), així que porten exactament les versions provades en local. Per això el context de build és **l'arrel del repositori** (`context: .` a `docker-compose.yml`) i hi ha un `.dockerignore` a l'arrel: si afegeixes un paquet, actualitza el lock (`npm install`) i fes commit dels dos fitxers, o el build fallarà amb un error de lock desincronitzat.

2.  **Aixecar els serveis:**
    ```bash
    npm run docker:up
    ```

L'aplicació estarà disponible a:

- **Frontend:** `http://localhost:8080` (mapejat al port 80 intern del contenidor).
- **Backend:** `http://localhost:3034` (mapejat al port 3033 intern del contenidor).

## 6. MQTT / OwnTracks (Mosquitto)

Ports del broker:

- `1883`: intern/dev, només al host (`127.0.0.1`).
- `51823`: TLS públic per OwnTracks (cal obrir-lo a firewall/NAT).

Configuració: copiar `mosquitto/config/mosquitto.conf.example` → `mosquitto.conf` (amb certs `fullchain.pem`/`privkey.pem` dins el contenidor). Per a desenvolupament local, usa `mosquitto.dev.conf.example` (sense TLS).

Backend: per defecte connecta a `mqtt://mosquitto:1883`. El fitxer `.otrc` que genera la UI apunta a `OTRC_HOST` si està definit i, si no, a `BASE_DOMAIN_URL`, amb `OTRC_PORT=51823`, `OTRC_TLS=true`. `BASE_DOMAIN_URL` és l'única font del domini per a nginx (`npm run nginx:render`) i per als certificats de Mosquitto.

Guia completa de MQTT (certs + renovació automàtica, Dynamic Security, `npm run mqtt:sync-dynsec`/`mqtt:regen-dynsec`, accés compartit a `mosquitto/data`, backup i troubleshooting): `docs/MQTT_DEPLOY.md`.

## 6b. Sincronització amb OSM (push sync)

Per publicar canvis locals cap a OpenStreetMap, cal configurar el token OAuth 2.0:

1. Registra una aplicació a https://www.openstreetmap.org/oauth2/applications
2. Scope necessari: `write_api`
3. **URI de redirecció**: el formulari d'OSM l'exigeix. Posa-hi una URL del teu
   desplegament (per exemple `https://<domini>/`). L'aplicació només fa servir el
   token al backend, així que no hi ha cap flux de callback, però si canvies de
   domini torna-la a actualitzar al registre d'OSM.
4. Afegeix a `back/.env`:

```env
OSM_ACCESS_TOKEN=el_teu_token_oauth2_aqui
#OSM_API_URL=https://api.openstreetmap.org/api/0.6
```

El token OAuth 2.0 d'OSM no expira. Sense aquesta variable, el push sync (`POST /api/osm/push-sync`) retornarà error. La pull sync (`POST /api/hidrants/sync?adf=<ID>`) funciona sense token (usa Overpass API pública).

## 7. Manteniment i Actualitzacions

### Actualitzar l'aplicació

Per actualitzar a l'última versió de Git i reconstruir els contenidors:

```bash
npm run docker:deploy
```

Cal que `node` i `npm` siguin al `PATH` (amb fnm: `eval "$(fnm env)"`, que el hook de shell fa sol en entrar al directori) i que la versió de Node sigui la del `.nvmrc` (Node 26). Si el `.nvmrc` apunta a una versió que no tens instal·lada, el canvi automàtic de fnm no es fa i l'script s'atura amb «npm no és al PATH»: instal·la-la abans del primer desplegament (`fnm install`, sense argument, llegeix el `.nvmrc`).

L'script (`scripts/deploy/update.sh`) fa, en aquest ordre i aturant-se al primer error:

1. Comprovacions prèvies: `back/.env` present, Docker i `docker compose` operatius, branca amb upstream, i avís si `back/.env` no té alguna clau de `back/.env.example`.
2. **Còpia de seguretat prèvia** de `back/data/` a `backups/pre-deploy/` (es conserven les 5 últimes). Atura el backend uns segons perquè la còpia sigui coherent.
3. `git pull --ff-only`. Si hi ha canvis locals, **s'atura** i t'ho diu; per forçar-ho, `--allow-dirty` (fa servir `--autostash`).
4. Neteja de `back/node_modules` i `front/node_modules` heretats del layout antic (`--prefix`), que podrien ombrejar les dependències noves.
5. `npm ci` amb el `package-lock.json` de l'arrel (reproducible; falla si el lock no quadra amb els `package.json`).
6. `docker compose build`. Si el build falla, **els contenidors en marxa no es toquen**.
7. `docker compose up -d` (les migracions s'apliquen en arrencar el contenidor).
8. Espera del healthcheck del backend (fins a 180 s) i del frontend, i comprovació HTTP de `127.0.0.1:3034/api/adfs` i `127.0.0.1:8080`.
9. `npm run update:boundaries` (Overpass/Nominatim). **No bloqueja**: si OSM no respon, avisa i el desplegament es dóna per bo.
10. `docker image prune -f` només si tot ha anat bé.

Opcions:

```bash
npm run docker:deploy -- --dry-run        # mostra les passes sense executar res
npm run docker:deploy -- --yes            # sense confirmació
npm run docker:deploy -- --allow-dirty    # permet canvis locals (autostash)
npm run docker:deploy -- --skip-backup    # no recomanat
npm run docker:deploy -- --no-boundaries  # omet update:boundaries
```

`update:boundaries` s'executa per defecte i és **best-effort**: depèn de l'API pública d'Overpass/Nominatim, així que un error o un temps d'espera esgostat només deixa un avís i les fronteres anteriors. Es llança després dels healthchecks, de manera que mai no impedeix que la nova versió quedi en marxa; per reintentar-lo, `npm run update:boundaries`.

**Si alguna passa falla**, l'script mostra els logs del servei afectat i el commit anterior. Per revertir:

```bash
git reset --hard <commit-anterior>
docker compose up -d --build
# Si les migracions ja s'havien aplicat, restaura també la BD:
./scripts/backup/restore.sh daily   # o el fitxer de backups/pre-deploy/
```

Les migracions són només cap endavant: tornar a una versió anterior del codi amb la BD migrada dóna errors, així que el rollback sempre ha d'incloure la restauració de la base de dades.

### Backups Automàtics de la Base de Dades

El projecte inclou un sistema complet de backups automàtics amb rotació. Els backups es guarden al directori `./backups/` amb diferents períodes de retenció:

- **Diari**: Es manté el backup del dia anterior
- **Setmanal**: Es manté el backup de fa una setmana
- **Mensual**: Es manté el backup de fa un mes
- **Semestral**: Es manté el backup de fa sis mesos

#### Configurar Backups Automàtics

1. **Instal·lar els cron jobs** (només cal fer-ho una vegada):

   ```bash
   cd "$PROJECT_DIR"
   ./scripts/backup/setup-cron.sh install
   ```

   Això configurarà els següents backups automàtics:
   - Diari: Cada dia a les 3:00 AM
   - Setmanal: Cada diumenge a les 3:30 AM
   - Mensual: Cada dia 1 del mes a les 4:00 AM
   - Semestral: 1 de gener i 1 de juliol a les 4:30 AM

2. **Verificar l'estat dels backups**:

   ```bash
   ./scripts/backup/check-backups.sh
   ```

3. **Verificar que els cron jobs estan actius**:
   ```bash
   ./scripts/backup/setup-cron.sh status
   ```

#### Fer un Backup Manual

Per fer un backup manual en qualsevol moment:

```bash
# Backup diari
./scripts/backup/backup.sh daily

# Backup setmanal
./scripts/backup/backup.sh weekly

# Backup mensual
./scripts/backup/backup.sh monthly

# Backup semestral
./scripts/backup/backup.sh semester
```

#### Restaurar un Backup

Per restaurar un backup existent:

```bash
# Restaurar l'últim backup diari
./scripts/backup/restore.sh daily

# Restaurar l'últim backup setmanal
./scripts/backup/restore.sh weekly

# Restaurar l'últim backup mensual
./scripts/backup/restore.sh monthly

# Restaurar l'últim backup semestral
./scripts/backup/restore.sh semester
```

**IMPORTANT**: El script de restauració:

- Aturarà temporalment el contenidor backend
- Farà una còpia de seguretat de les dades actuals abans de restaurar
- Et demanarà confirmació abans de procedir
- Reiniciarà el contenidor automàticament

#### Desinstal·lar els Backups Automàtics

Si necessites desactivar els backups automàtics:

```bash
./scripts/backup/setup-cron.sh uninstall
```

#### Notificacions per Telegram

Si has configurat les variables `TELEGRAM_BOT_TOKEN` i `TELEGRAM_CHAT_ID` al fitxer `back/.env`, rebràs notificacions automàtiques quan:

- Un backup es completa correctament
- Un backup falla
- Hi ha problemes amb el sistema de backups

#### Logs de Backups

Els logs de tots els backups automàtics es guarden a:

```
./backups/backup.log
```

Per veure els últims logs:

```bash
tail -f ./backups/backup.log
```

### Neteja i Re-importació

Si vols forçar una neteja total dels hidrants i tornar-los a baixar d'OSM (per exemple, per desfer canvis locals erronis):

```bash
npm run db:reset-hidrants
```

### Logs

Per veure què està passant als contenidors:

```bash
npm run docker:logs
```

## 7b. Canviar de domini o d'ubicació

El domini viu només a `BASE_DOMAIN_URL` (`back/.env`); `OTRC_HOST` només cal si el broker OwnTracks és en un altre host. La ubicació no està hardcodejada: els scripts calculen `PROJECT_DIR` a partir de la seva posició i `docker-compose.yml` fixa `name: territoriadf`. Els passos complets, amb els efectes sobre certificats, Telegram, OSM, MQTT, backups i el nom del repositori de git, són a **[docs/DOMAIN_CHANGE.md](DOMAIN_CHANGE.md)**.

Els passos complets per migrar la pila d'una instància (renombrar contenidors i, després, canviar de domini) són a **[docs/MIGRATION.md](MIGRATION.md)**: ordre d'execució, verificacions, rollback i criteris de sortida. Les dades concretes de cada migració no es guarden a la documentació permanent: es porten en un expedient a `docs/migracio/`, que no es versiona (és al `.gitignore`).

## 8. Publicació a Internet

Per defecte, l'aplicació està configurada per escoltar a `127.0.0.1` per seguretat. Per publicar-la:

1.  **Opció A:** Utilitzar un Reverse Proxy (Nginx, Traefik) al host que apunti a `localhost:8080`.
2.  **Opció B:** Modificar `docker-compose.yml` per obrir el port 80 directament: `0.0.0.0:80:80`.

## 9. Notificacions Telegram per ADF (webhooks)

Cada ADF pot usar el seu bot de Telegram amb un grup propi (configuració des de la UI: **Configuració → Notificacions de Telegram**). El backend necessita rebre actualitzacions de Telegram a `POST /api/telegram/webhook/:secret`.

**En producció no cal configuració addicional:**

- La URL del webhook es deriva del `Host` de la petició de registre → el domini que exposa l'app (Nginx amb cert Let's Encrypt) és l'URL que Telegram cridarà. Assegura que el reverse proxy reenvia `/api/telegram/webhook/*` al backend (el mateix `/api` que ja es proxya).
- El domini ha de ser **públicament accessible** des d'Internet: Telegram rebutja IPs privades i certificats self-signed.
- El token del bot es guarda **xifrat** a la DB (`ENCRYPTION_SECRET`) i mai surt del backend; el webhook només es confirma per secret aleatori per bot.

**Si el domini públic difereix del `Host` intern** (per exemple un load balancer), força la URL amb:

```env
WEBHOOK_PUBLIC_URL=https://el_teu_domini_public
```

Self-test (host):

```bash
npm run telegram:selftest
```

## 10. Checklist de desplegament

Coses que el codi **no** pot fer per tu perquè depenen del servidor o són secrets. Marca-les totes abans de donar el desplegament per bo.

Resum del que demana cada canvi d'aquesta versió:

| Canvi                                                                    | Què cal fer al desplegar                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `JWT_SECRET` i `ENCRYPTION_SECRET` obligatoris (mínim 32, sense defecte) | Generar-los al servidor. Si en falta un, el backend **no arrenca** |
| Token de sessió només a cookie `httpOnly` (30 dies, `secure` en prod)    | Entrar sempre per HTTPS; canviar `JWT_SECRET` desconnecta tothom   |
| Mínim de contrasenya publicat a `GET /api/config`                        | Res; comprovar que el formulari de la UI mostra el mínim de 8      |
| Regles de contrasenya (lletres+xifres, no repetida, sense nom d'usuari)  | Res; les contrasenyes antigues **no** es revaliden soles           |
| Fre de força bruta al login (429, finestra de 15 min)                    | `TRUST_PROXY=true` si hi ha proxy; provar els 6 intents fallits    |

### 10.1 Secrets i `back/.env`

- [ ] `cp back/.env.example back/.env` i omplir-lo. El backend **no arrenca** sense `JWT_SECRET` ni `ENCRYPTION_SECRET` (mínim 32 caràcters).
- [ ] Generar-ne de nous al servidor, no reutilitzar els de desenvolupament:
  ```bash
  openssl rand -base64 64   # JWT_SECRET
  openssl rand -base64 64   # ENCRYPTION_SECRET
  ```
- [ ] Si la BD ja tenia dades, canviar `ENCRYPTION_SECRET` **invalida** els secrets xifrats (`mqtt_users.mqtt_password_enc`, `telegramBots.token_enc`): caldrà tornar a activar el tracking de cada usuari i tornar a registrar el bot de cada ADF. En un desplegament nou no afecta res.
- [ ] Si canvies `JWT_SECRET`, tots els tokens de 30 dies deixen de valer: tothom haurà de tornar a entrar (no perden la contrasenya, només la sessió). Fes-ho a posta i avisa.
- [ ] Les contrasenyes creades abans d'aquesta versió **no es revaliden**: un compte amb `12345678` continua entrant fins que la canviï. Si vols tancar-ho, genera enllaços d'accés nous per als comptes febles des de Configuració → Usuaris.
- [ ] `BASE_DOMAIN_URL=<domini>` (sense `https://`). `OTRC_PORT=51823`, `OTRC_TLS=true`; `OTRC_HOST` només si el broker OwnTracks és en un altre host.

### 10.2 Proxy, HTTPS i xarxa

- [ ] `TRUST_PROXY=true` a `back/.env`: la petició passa pel Nginx del contenidor `frontend` i pel Nginx del host, així que `request.ip` ha de sortir de `X-Forwarded-For` perquè funcioni el límit de 30 intents per IP (§10.9 de `docs/DEV.md`). Deixa'l a `false` només si exposes el 3033 directament a Internet.
- [ ] El proxy del host ha de reenviar `/api/` a `127.0.0.1:8080` conservant `Host`, `X-Forwarded-For` i `X-Forwarded-Proto`. El `Host` és el que permet derivar la URL del webhook de Telegram sense `WEBHOOK_PUBLIC_URL`.
- [ ] Entrar **sempre per HTTPS**: la imatge va amb `NODE_ENV=production` i la cookie `auth_token` es marca `secure`, així que per HTTP pla el navegador no la desa i el login sembla que falli.
- [ ] Firewall: només 80/443 i 51823 (OwnTracks TLS) oberts. `3034` (backend), `8080` (front) i `1883` (MQTT) han de quedar a `127.0.0.1`.
- [ ] Cert Let's Encrypt renovat per cron i hook de còpia a Mosquitto (`scripts/copy-mosquitto-certs.sh`).

### 10.3 Just abans de pujar

- [ ] `npm run docker:deploy -- --dry-run` per veure les passes.
- [ ] Còpia de seguretat: l'script en fa una de `back/data/` a `backups/pre-deploy/`, però si desplegues a mà, `./scripts/backup/backup.sh daily` primer.
- [ ] `git status` net. No hi ha d'aparèixer `back/.env` (si hi apareix, el `.gitignore` s'ha trencat i els secrets es publicarien).
- [ ] Les migracions són només cap endavant: un rollback de codi sense restaurar la BD dóna errors.

### 10.4 Just després de pujar

- [ ] `curl -s https://<domini>/api/config` → `"min_password_length":8` i `role_permissions`.
- [ ] Fre de força bruta: 5 intents dolents seguits i el 6è ha de ser `429` amb `Retry-After`.
  ```bash
  for i in 1 2 3 4 5 6; do
    curl -s -o /dev/null -w "%{http_code}\n" -H 'Content-Type: application/json' \
      -d '{"username":"prova-deploy","password":"malament1"}' https://<domini>/api/auth/login
  done
  # esperat: 401 401 401 401 401 429
  ```
  Al log ha d'aparèixer `Login bloquejat per massa intents` (sense contrasenya).
- [ ] Entrar per la UI amb un usuari real: el formulari de contrasenya ha de mostrar el mínim de 8 caràcters (ve de `/api/config`, no està hardcodejat al front).
- [ ] Comprovar que el `429` es veu a la pantalla de login amb el missatge en català i no com un error genèric.
- [ ] `docker compose ps` amb tots els serveis `healthy` i `npm run docker:logs` sense errors.
- [ ] Telegram: registrar el bot d'una ADF de prova i comprovar que la vinculació al grup arriba (webhook HTTPS públic).
- [ ] Backups actius: `./scripts/backup/setup-cron.sh status`.

> El comptador del fre de força bruta viu **en memòria**: reiniciar el backend l'esborra i no queda cap rastre de les contrasenyes provades. Amb una sola instància n'hi ha prou; si un dia escales el backend a diverses rèpliques, cada una comptaria els seus propis intents.
