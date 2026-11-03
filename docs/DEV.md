# Guia de Desenvolupament Local

Aquesta guia cobreix **desenvolupament local**. Per a altres entorns i temes específics, consulta el mapa de documentació.

## Mapa de documentació

| Document              | Contingut                                                                                                        | Quan usar-lo                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `README.md`           | Visió general, característiques, stack i resum OSM                                                               | Presentació ràpida del projecte       |
| `docs/DEV.md`         | **Aquest fitxer**: setup local, execució, variables, MQTT dev, Telegram dev, OSM quickref, API i troubleshooting | Desenvolupar en local                 |
| `docs/DEPLOY.md`      | Deploy producció amb Docker, backups, Telegram prod i MQTT prod resum                                            | Pujar a servidor                      |
| `docs/OSM_SYNC.md`    | Sincronització bidireccional OSM completa (fluxos, UI, conflictes, validació, API)                               | Treballar amb OSM a fons              |
| `docs/MQTT_DEPLOY.md` | MQTT producció: TLS, certs, Dynamic Security, `init-dynsec.py`, permisos `mosquitto/data`                        | Configurar Mosquitto en prod          |
| `AGENTS.md`           | Arquitectura, model ADF-centric, rols/permisos i convencions per agents                                          | Context ràpid per a IA/col·laboradors |
| `back/.env.example`   | Referència canònica de totes les variables d'entorn del backend                                                  | Consultar valors per defecte          |

---

## 1. Requisits

- **Node.js >=26** i **npm** (vegeu `package.json:60`, `.nvmrc`)
- **Docker** i **Docker Compose** (per `mqtt:up` i `docker:up`)
- **Python 3** (per `scripts/init-dynsec.py` → `mqtt:sync-dynsec` / `mqtt:regen-dynsec`)
- **Git**

---

## 2. Instal·lació ràpida

```bash
cp back/.env.example back/.env
cp mosquitto/config/mosquitto.dev.conf.example mosquitto/config/mosquitto.conf
npm ci                 # instal·la els workspaces front + back des del lock de l'arrel
npm run db:setup       # db:reset + db:seed + db:import-osm + update:boundaries
npm run mqtt:sync-dynsec
```

**Nota `mqtt:sync-dynsec`:** genera `mosquitto/data/dynamic-security.json` llegint les contrasenyes MQTT de `back/.env` (`MQTT_ADMIN_PASSWORD`, `MQTT_BACKEND_PASSWORD` i opcionals `MQTT_ADMIN_USERNAME`/`MQTT_BACKEND_USERNAME`, per defecte `admin`/`backend`). Cal executar-ho **abans** de `npm run mqtt:up`. El plugin Dynamic Security llegeix aquest JSON en arrencar; sense ell Mosquitto no autoritza `backend`. Detall producció i format exacte del JSON: `docs/MQTT_DEPLOY.md#4`.

---

## 3. Variables d'entorn

Tant `front/` com `back/` requereixen `.env`. La referència canònica és `back/.env.example` (79 línies).

### 3.1 Backend (`back/.env`)

| Variable                | Obligatòria      | Per defecte                                                      | Descripció                                                                                                                                                                                           |
| ----------------------- | ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`            | sí               | —                                                                | Clau per signar JWT (`auth_token` httpOnly, 30 dies). Mínim 32 caràcters i **sense valor per defecte**: el backend no arrenca si falta. Genera amb `openssl rand -base64 64`                         |
| `ENCRYPTION_SECRET`     | sí               | —                                                                | Clau per xifrar `mqtt_users.mqtt_password_enc` i `telegramBots.token_enc`. Mínim 32 caràcters, sense valor per defecte                                                                               |
| `PORT`                  | no               | `3033`                                                           | Port del backend Fastify                                                                                                                                                                             |
| `TRUST_PROXY`           | no               | `false`                                                          | `true` si el backend va darrere d'un proxy invers (nginx/Caddy): `request.ip` surt de `X-Forwarded-For` i funcionen els límits de login per IP (vegeu §10.9). No activar si està exposat directament |
| `MQTT_BROKER_URL`       | no               | `mqtt://localhost:1883` (dev) / `mqtt://mosquitto:1883` (Docker) | URL broker. **Dev fora Docker:** `mqtt://localhost:1883`. **Dins Docker:** `mqtt://mosquitto:1883`                                                                                                   |
| `MQTT_ADMIN_PASSWORD`   | dev/prod         | —                                                                | Password admin Dynamic Security                                                                                                                                                                      |
| `MQTT_BACKEND_PASSWORD` | dev/prod         | —                                                                | Password client `backend` Dynamic Security                                                                                                                                                           |
| `MQTT_ADMIN_USERNAME`   | no               | `admin`                                                          | Username admin DynSec                                                                                                                                                                                |
| `MQTT_BACKEND_USERNAME` | no               | `backend`                                                        | Username backend DynSec                                                                                                                                                                              |
| `MQTT_TOPIC_PREFIX`     | no               | `owntracks/hidrants`                                             | Prefix OwnTracks; backend escolta `${MQTT_TOPIC_PREFIX}/#`                                                                                                                                           |
| `OTRC_HOST`             | no               | —                                                                | Host públic al `.otrc` OwnTracks (domini prod o IP LAN dev)                                                                                                                                          |
| `OTRC_PORT`             | no               | `51823`                                                          | Port públic MQTT                                                                                                                                                                                     |
| `OTRC_TLS`              | no               | `true` (prod)                                                    | `true` amb TLS (prod) / `false` pla (dev)                                                                                                                                                            |
| `WEBHOOK_PUBLIC_URL`    | dev sí / prod no | —                                                                | URL https pública on Telegram arriba a `/api/telegram/webhook/:secret`. En dev cal túnel (vegeu §8). En prod es deriva del `Host` si no es defineix                                                  |
| `OVERPASS_URL`          | no               | `https://overpass-api.de/api/interpreter`                        | Overpass per pull sync                                                                                                                                                                               |
| `OSM_ACCESS_TOKEN`      | només push       | —                                                                | Token OAuth 2.0 OSM `write_api` (registrar a https://www.openstreetmap.org/oauth2/applications, no expira)                                                                                           |
| `OSM_API_URL`           | no               | `https://api.openstreetmap.org/api/0.6`                          | API OSM per push                                                                                                                                                                                     |
| `TELEGRAM_BOT_TOKEN`    | no               | —                                                                | Bot global admin (backups/notificacions sistema)                                                                                                                                                     |
| `TELEGRAM_CHAT_ID`      | no               | —                                                                | Chat global admin                                                                                                                                                                                    |
| `GRAPHHOPPER_API_KEY`   | no               | —                                                                | Per `/api/route`                                                                                                                                                                                     |
| `FASTIFY_LOGLEVEL`      | no               | `info`                                                           | `fatal`/`error`/`warn`/`info`/`debug`/`trace`                                                                                                                                                        |

### 3.2 Frontend (`front/.env`)

| Variable       | Descripció                                           |
| -------------- | ---------------------------------------------------- |
| `VITE_API_URL` | URL base API, per defecte `/api` (proxiat per Nginx) |

---

## 4. Execució

### 4.1 Frontend + backend local (Vite + tsx)

```bash
npm run mqtt:up   # docker compose up -d mosquitto (només broker)
npm run dev       # concurrently: back (tsx watch) + front (Vite)
```

### 4.2 Tot amb Docker

```bash
npm run docker:up    # docker compose up -d (backend + frontend + mosquitto)
npm run docker:logs  # docker compose logs -f
npm run docker:down  # atura contenidors
```

### 4.3 URLs

| Servei                     | URL                                                             |
| -------------------------- | --------------------------------------------------------------- |
| Frontend local (Vite)      | `http://localhost:3003`                                         |
| Backend local              | `http://localhost:3033`                                         |
| Frontend Docker (Nginx)    | `http://localhost:8080`                                         |
| Backend Docker             | `http://localhost:3034` (mapejat a 3033 intern)                 |
| Mosquitto intern/dev       | `mqtt://localhost:1883`                                         |
| Mosquitto OwnTracks públic | `mqtt://<OTRC_HOST>:51823` (`OTRC_TLS=true` prod / `false` dev) |

---

## 5. Scripts (npm)

Font canònica: `package.json:5` i `back/package.json`. Agrupats per tema.

| Script                            | Descripció                                                                                                                                                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Frontend + backend simultanis (Vite + tsx)                                                                                                                                                                                                           |
| `npm run build`                   | Build front + back                                                                                                                                                                                                                                   |
| `npm run start`                   | Arrenca backend compilat (`back/dist`)                                                                                                                                                                                                               |
| `npm run lint` / `lint:fix`       | ESLint a `front` + `back` (vegeu §11)                                                                                                                                                                                                                |
| `npm run typecheck`               | `tsc --noEmit` a `front` + `back`                                                                                                                                                                                                                    |
| `npm run format` / `format:check` | Prettier                                                                                                                                                                                                                                             |
| `npm run mqtt:up`                 | `docker compose up -d mosquitto`                                                                                                                                                                                                                     |
| `npm run mqtt:cleanup`            | Neteja identitats MQTT obsoletes: alinea `mqtt_users.mqtt_username` amb username actual i esborra clients DynSec `owntracks-device` orfes. **Dry-run** per defecte; aplica amb `npm run mqtt:cleanup -- --apply` (`back/src/scripts/cleanupMqtt.ts`) |
| `npm run mqtt:sync-dynsec`        | `python3 scripts/init-dynsec.py sync` — no destructiu, conserva clients usuaris                                                                                                                                                                      |
| `npm run mqtt:regen-dynsec`       | `python3 scripts/init-dynsec.py regen` — **destructiu**, esborra clients usuaris, demana confirmació                                                                                                                                                 |
| `npm run docker:up`               | `docker compose up -d`                                                                                                                                                                                                                               |
| `npm run docker:down`             | `docker compose down`                                                                                                                                                                                                                                |
| `npm run docker:build`            | `docker compose build`                                                                                                                                                                                                                               |
| `npm run docker:logs`             | `docker compose logs -f`                                                                                                                                                                                                                             |
| `npm run docker:clean`            | `docker image prune -f`                                                                                                                                                                                                                              |
| `npm run docker:deploy`           | Actualització en producció: executa `scripts/deploy/update.sh` (còpia prèvia de la BD, `git pull --ff-only`, `npm ci`, `docker compose build` + `up -d`, healthchecks i `update:boundaries` best-effort). Detall i opcions a `docs/DEPLOY.md` §7     |
| `npm run db:reset`                | Buida BD (`back/data/hidrants.db`)                                                                                                                                                                                                                   |
| `npm run db:seed`                 | Crea ADFs i usuaris inicials (admin global + coordinador per ADF); la contrasenya inicial és aleatòria i es mostra un sol cop al log                                                                                                                 |
| `npm run db:import-osm`           | Pull sync OSM via Overpass (requereix `osm_relations` a `adfs`)                                                                                                                                                                                      |
| `npm run db:export-osm`           | Push sync OSM (requereix `OSM_ACCESS_TOKEN`)                                                                                                                                                                                                         |
| `npm run db:reset-hidrants`       | Neteja només hidrants i re-importa OSM                                                                                                                                                                                                               |
| `npm run db:setup`                | `db:reset && db:seed && db:import-osm && update:boundaries`                                                                                                                                                                                          |
| `npm run update:boundaries`       | Actualitza `adfs.bbox`/`center`/`boundary_geojson` des d'Overpass                                                                                                                                                                                    |
| `npm run create:user`             | `npm run create:user <usuari> <contrasenya> [rol] [adf_id]` — crea usuari directe a BD (`admin`/`coordinador`/`voluntari`)                                                                                                                           |
| `npm run telegram:selftest`       | Self-test lògica vinculació Telegram sense xarxa                                                                                                                                                                                                     |
| `npm run prepare`                 | Husky hooks (`prepare: husky`)                                                                                                                                                                                                                       |

Per paquet: `front/` (`dev`, `build`), `back/` (`db:migrate`, `dev`, `build`, `mqtt:cleanup`).

---

## 6. Arquitectura (resum)

- **Stack:** React 19 + Leaflet 1.9 / React-Leaflet 5 (front), Fastify 5 + TypeScript + Drizzle ORM + SQLite + Zod (back), Mosquitto 2 (MQTT).
- **Model ADF-centric:** `adfs` és la unitat principal (no municipis). Una ADF agrupa `osm_relations`; `bbox`, `center` i `boundary_geojson` es desen a `adfs`. `users.adf_id` vincula usuari a ADF; admin `adf_id = null`.
- **SPA:** Un domini, canvi ADF via `AdfContext` i selector. Flux dades: `GET /api/adf?adf=ID`, `GET /api/adf/boundary?adf=ID` (GeoJSON), `GET /api/hidrants?adf=ID` (GeoJSON).
- **Rols i permisos:** `admin` (tot) / `coordinador` (ADF pròpia) / `voluntari` (edició camp) / `public` (només lectura). Matriu central `back/src/permissions.ts: rol → capacitats` (`create_hydrant`, `delete_hydrant`, `sync_osm`, `create_incidencia`, `view_all_positions`, `manage_telegram`, etc.). Middleware `back/src/server.ts:164` valida capacitat i abast ADF amb el rol i l'ADF **rellegits de la BD** a cada petició (el JWT només identifica l'usuari, així un canvi de rol o un usuari esborrat té efecte immediat); `permissionsFor()` avisa al log si el rol no és a la matriu. `POST /api/auth/login` i `GET /api/auth/me` retornen el `user` amb `permissions[]` i `mqtt_enabled`; `GET /api/config` publica `role_permissions` (matriu rol → permisos) perquè el front no la dupliqui (vista "veure com"), i `min_password_length` per al `minLength` dels formularis de contrasenya. Username no-admin: `XXX/YYY` o `XXX/GI/YYY` (`back/src/routes/users.ts:12`).
- **Seguretat:** JWT a cookie `httpOnly` (`secure` en prod), validació per capacitat + propietat ADF.
- **Incidències:** `incidencies.visibilitat` (`PUBLICA` | `TOTES_ADFS` | `ADF_PRIVADA`). Públic veu només `PUBLICA`; loguejat veu seves + globals; admin tot.
- **Tracking compartit:** `adfs.tracking_shared` boolean opt-in; `PUT /api/adfs/:id/tracking-sharing` (admin qualsevol, coordinador la seva).
- **Resiliència MQTT:** backend funciona encara que Mosquitto no disponible (`startMqttService().catch` a `back/src/server.ts:276`).
- **Proxy:** Nginx cap a contenidors; tiles i Overpass cachejats.

> Detall complet d'arquitectura i lògica: `AGENTS.md`.

---

## 7. MQTT / OwnTracks

El backend escolta `${MQTT_TOPIC_PREFIX}/#` (per defecte `owntracks/hidrants/#`) i valida payloads amb Zod (`back/src/services/mqtt.ts`).

### 7.1 Identitat MQTT aplanada

L'ACL DynSec no admet `/` als usernames. La identitat OwnTracks (client DynSec `owntracks-device` i topics) substitueix `/` per `_`: `278/GI/011` → `278_GI_011` (`mqttNameFor()` a `back/src/services/mqtt.ts`). `/api/tracking/positions` la reverteix per mostrar `278/GI/011` a la UI. El `.otrc` també es genera amb la identitat plana.

### 7.2 Configuració .otrc (OwnTracks)

**Producció** (TLS):

```env
OTRC_HOST=<DOMINI>
OTRC_PORT=51823
OTRC_TLS=true
```

El listener `51823` usa certs Let's Encrypt (`mosquitto/certs/fullchain.pem`/`privkey.pem`). Vegeu `docs/MQTT_DEPLOY.md` per certs, `docker-compose.yml` i `scripts/copy-mosquitto-certs.sh` (hook renovació que llegeix `OTRC_HOST`).

**Desenvolupament** (pla, sense TLS, mateix port publicat a `0.0.0.0` a `docker-compose.yml`):

```env
OTRC_HOST=<IP_LAN_DEV>
OTRC_PORT=51823
OTRC_TLS=false
```

El `.otrc` que baixa la UI (`/api/tracking/config` / `enable`) apunta a aquests valors.

### 7.3 Reconnexió amb backoff exponencial

El backend desactiva l'auto-reconnect fix (`reconnectPeriod: 0` a `back/src/services/mqtt.ts`) i gestiona reconnexió manual: `5s → 10s → 20s → 40s → 60s → 60s…` (`RECONNECT_BASE=5000`, `RECONNECT_MAX=60000`, `RECONNECT_FACTOR=2`). En `connect` reseteja comptador; `close`/`error` programen `scheduleReconnect()`; `stop()` neteja timer. Evita spam quan Mosquitto no disponible.

### 7.4 Prova manual

Amb credencials DynSec vàlides:

```bash
docker compose exec mosquitto mosquitto_pub -h localhost -u <usuari> -P <password> -t 'owntracks/hidrants/<usuari>/phone' -m '{"_type":"location","lat":41.5,"lon":1.8,"tst":1721667688,"acc":10,"batt":80}'
```

Logs útils: `[MQTT] ✅ Connected`, `🔄 Reconnecting`, `❌ Subscribe error`.

### 7.5 Neteja d'identitats

Si queden clients antics orfes (usernames sense `GI/` o amb format antic), neteja:

```bash
npm run mqtt:cleanup          # dry-run
npm run mqtt:cleanup -- --apply
```

Alinia `mqtt_users.mqtt_username` amb el nom actual i esborra clients DynSec orfes. Script: `back/src/scripts/cleanupMqtt.ts`. També s'auto-cura a `PUT /api/users/:id` i `GET /api/tracking/config`.

> **Producció completa:** `docs/MQTT_DEPLOY.md` (certs + renovació, Dynamic Security JSON exacte, `mqtt:sync-dynsec`/`regen`, permisos `mosquitto/data` amb `group mosquitto` + `setfacl`, backup, `createMqttUser` via `$CONTROL`).

---

## 8. Notificacions Telegram per ADF

Cada ADF pot tenir **bot propi** i **grup propi** on rep avisos (incidències, altes i edicions d'hidrants). Es configura des de la UI **Configuració → Notificacions de Telegram**: backend registra bot (token xifrat `ENCRYPTION_SECRET` a `telegramBots.token_enc`), genera deep link `startgroup` d'un sol ús (TTL 15 min, `telegramLinks` amb `code_hash = sha256hex(code)`) i el webhook completa la vinculació quan el bot s'afegeix al grup.

Endpoint webhook:

```
POST /api/telegram/webhook/:secret
```

Lògica a `back/src/routes/telegramWebhook.ts:39` (vincula amb codi `startgroup`, valida `group`/`supergroup`, conflicte grup-ADF, expiració/ús, `my_chat_member` per detectar sortida del bot).

### 8.1 Dev local: cal túnel

Telegram exigeix webhook **HTTPS amb cert de confiança** (rebutja self-signed i IPs privades). Un `nip.io` amb `mkcert` **NO serveix**. La manera senzilla és Cloudflare:

```bash
npx -y cloudflared tunnel --url http://localhost:3033
```

Copia la URL (`https://xxx.trycloudflare.com`) a `back/.env` i reinicia backend:

```env
WEBHOOK_PUBLIC_URL=https://xxx.trycloudflare.com
```

Comprova:

```bash
curl https://xxx.trycloudflare.com/api/telegram/webhook/prova
# {"ok":false}
```

**Avís:** la URL _quick_ de Cloudflare canvia a cada execució. Per URL estable, crea túnel amb nom (`cloudflared tunnel create`) o usa cert de veritat.

### 8.2 Com es construeix la URL del webhook

Si `WEBHOOK_PUBLIC_URL` definit, s'usa tal qual (`back/src/routes/telegram.ts:125` → `config.WEBHOOK_PUBLIC_URL ?? appBaseUrl(req)`). Si no, es deriva del `Host` de la petició de registre (`appBaseUrl()` a `back/src/utils/appUrl.ts`). En prod cal entrar per domini públic; en dev per `localhost:5173` sense variable es generaria URL LAN no accessible.

### 8.3 Self-test

```bash
npm run telegram:selftest   # lògica vinculació sense xarxa
```

> **Producció:** no cal `WEBHOOK_PUBLIC_URL` si entres per domini públic amb Nginx que proxya `/api/telegram/webhook/*`. El domini ha de ser públic. Detall: `docs/DEPLOY.md#9`.

---

## 9. Sincronització amb OSM

Sincronització **bidireccional** amb OpenStreetMap: pull (Overpass) i push (API OSM OAuth 2.0). Detall complet amb fluxos, UI, conflictes i validació: **`docs/OSM_SYNC.md`**.

### 9.1 Configuració

Per push cal a `back/.env`:

```env
OSM_ACCESS_TOKEN=el_teu_token_oauth2_aqui
#OSM_API_URL=https://api.openstreetmap.org/api/0.6
#OVERPASS_URL=https://overpass-api.de/api/interpreter
```

Token OAuth 2.0 sense expiració: registrar a https://www.openstreetmap.org/oauth2/applications amb scope `write_api`. Sense token, `POST /api/osm/push-sync` retorna error; pull funciona sense token (Overpass públic).

### 9.2 Pull sync (importació)

```bash
npm run db:import-osm
# o via API: POST /api/hidrants/sync?adf=<ID>  body: {}
#            POST /api/hidrants/sync?adf=<ID>  body: { "force": true }
```

Descarrega via Overpass per les `osm_relations` de l'ADF.

**Comportament segons estat local:**

| Estat local      | Pull normal                                 | Pull `force=true`        |
| ---------------- | ------------------------------------------- | ------------------------ |
| `SYNCED`         | Actualitza des d'OSM                        | Actualitza des d'OSM     |
| `MISSING_IN_OSM` | Es restaura → `SYNCED` si OSM el té         | Igual que el pull normal |
| `PENDING_CREATE` | No toca (es manté)                          | Sobreescriu → `SYNCED`   |
| `PENDING_UPDATE` | No toca si local més nou; sinó → `CONFLICT` | Sobreescriu → `SYNCED`   |
| `PENDING_DELETE` | No toca                                     | Torna d'OSM → `SYNCED`   |
| `CONFLICT`       | No toca                                     | Sobreescriu → `SYNCED`   |
| `ERROR`          | No toca                                     | Sobreescriu → `SYNCED`   |
| `REVIEW`         | No toca                                     | Sobreescriu → `SYNCED`   |

Els hidrants que hi havia a la BD i ja no apareixen a OSM **no s'esborren**: es marquen `MISSING_IN_OSM`, es conserven amb `osm_tags` i `private_tags` i s'amaguen del mapa. La purga és manual: panell OSM → secció «Ja no són a OSM» (🗑 per fila o «Esborrar-los tots») o `POST /api/osm/missing/purge` amb `{ adf_id }` o `{ ids }`.

### 9.3 Push sync (publicació)

```bash
npm run db:export-osm
# o via API: POST /api/osm/push-sync
```

Publica `PENDING_CREATE`/`PENDING_UPDATE`/`PENDING_DELETE` en un changeset. Gestiona **409 conflicte versió** (merge automàtic si ubicació no canvia, sinó `CONFLICT`) i `ERROR`.

**Push selectiu / descartar / pull individual:**

```bash
POST /api/osm/push-selected   # { "ids": ["abc123", "def456"] }
POST /api/osm/discard-selected # { "ids": [...] }  PENDING_CREATE→esborra BD, resta→SYNCED
POST /api/osm/pull-hydrant     # { "id": "abc123" } sobreescriu amb OSM
```

### 9.4 UI panell sincronització

`front/src/components/osm/OsmSyncPanel.tsx`: capçalera “Baixar d'OSM” (pull normal), seccions col·lapsables per estat amb comptador, checkboxes + “Seleccionar tot”, accions lot “Pujar seleccionats” / “Descartar”, accions individuals ↑ Pujar / ↓ Baixar (sobreescriu) / ✕ Descartar (amb confirmació), selecció al mapa (`select-hydrant-by-id` → cercle + info), refresc automàtic `refresh-hidrants`. Vegeu `docs/OSM_SYNC.md#4` per detall.

### 9.5 Exportació .osc

```bash
GET /api/osm/conflicts/osc?adf=ID
```

Fitxer OSM XML compatible JOSM.

### 9.6 Validació de dades

Abans de pujar, `back/src/services/osmDataValidator.ts` valida tags:

| Camp        | Tag OSM                 | Valors permesos                            |
| ----------- | ----------------------- | ------------------------------------------ |
| Tipus       | `fire_hydrant:type`     | `pillar`, `underground`                    |
| Posició     | `fire_hydrant:position` | `lane`, `sidewalk`, `green`                |
| Acoblaments | `couplings`             | `1`, `2`, `3`, `4`                         |
| Diàmetres   | `couplings:diameters`   | `45`, `70`, `100` (altres → warning)       |
| Pressió     | `fire_hydrant:pressure` | Qualsevol (número o text: `yes`, `low`...) |
| Data        | `survey:date`           | `YYYY-MM-DD`                               |

Addicional: majúscules ≥3 caràcters → warning; tag >255 caràcters → error; tags buits s'eliminen. **Error → `ERROR` (bloqueja push); Warning → `REVIEW` (es mostra perquè admin revisi, `docs/OSM_SYNC.md#8` i `OsmReviewList.tsx`).**

### 9.7 Estats

| Estat            | Significat                               |
| ---------------- | ---------------------------------------- |
| `SYNCED`         | Sincronitzat amb OSM                     |
| `MISSING_IN_OSM` | Ja no és a OSM; es conserva localment    |
| `PENDING_CREATE` | Nou local, pendent crear                 |
| `PENDING_UPDATE` | Modificat localment, pendent actualitzar |
| `PENDING_DELETE` | Marcat per esborrar                      |
| `CONFLICT`       | Conflicte versió                         |
| `ERROR`          | Error sincronització                     |
| `REVIEW`         | Warnings, pendent revisió                |

Transicions i casos d'ús detallats: `docs/OSM_SYNC.md#5-6`.

### 9.8 Endpoints OSM

| Endpoint                        | Mètode | Descripció                                |
| ------------------------------- | ------ | ----------------------------------------- |
| `/api/osm/status`               | GET    | Estat token i comptador conflictes        |
| `/api/osm/pending?adf=ID`       | GET    | Canvis pendents amb detalls               |
| `/api/osm/push-sync`            | POST   | Push global                               |
| `/api/osm/push-selected`        | POST   | Push selectiu `{ ids }`                   |
| `/api/osm/discard-selected`     | POST   | Descarta `{ ids }`                        |
| `/api/osm/conflicts?adf=ID`     | GET    | Conflictes amb detalls                    |
| `/api/osm/conflicts/osc?adf=ID` | GET    | Fitxer `.osc` per JOSM                    |
| `/api/osm/conflicts/resolve`    | POST   | Resol conflicte `{ id, changeset? }`      |
| `/api/osm/reviews?adf=ID`       | GET    | Hidrants `REVIEW`                         |
| `/api/osm/pull-hydrant`         | POST   | Baixa node `{ id }`                       |
| `/api/osm/diff/:id`             | GET    | Diff local vs OSM                         |
| `/api/hidrants/sync?adf=ID`     | POST   | Pull sync `{ force? }` (vegeu taula §9.2) |
| `/api/hidrants/stats?adf=ID`    | GET    | Comptadors per `sync_status`              |

Fitxers clau: `back/src/services/osmSync.ts` (pull Overpass), `back/src/services/osmPushSync.ts` (push), `back/src/services/osmDataValidator.ts`, `back/src/services/osmConflictResolver.ts`, `back/src/routes/osm.ts`, `front/src/components/osm/OsmConflictList.tsx`, `OsmReviewList.tsx`. Detall API complet: `docs/OSM_SYNC.md#9`.

---

## 10. API — Referència ràpida (endpoints no OSM)

Tots els `POST/PUT/DELETE` d'hidrants i incidències requereixen sessió (`auth_token` httpOnly, 30 dies, `sameSite=lax`, `secure` en prod). El JWT es signa amb `expiresIn: '30d'` i només viatja dins la cookie: el login no el retorna al cos de la resposta. El middleware `wrap()` a `back/src/server.ts:164` aplica capacitat (`permissionsFor()` a `back/src/permissions.ts`) i abast ADF (no-admin només la seva ADF) amb el rol i l'ADF llegits de la BD a cada petició (el JWT només identifica l'usuari); les rutes amb `protected: true` exigeixen sessió vàlida sempre. Per OSM vegeu §9.8 i `docs/OSM_SYNC.md#9`. Definició i protecció a `back/src/server.ts:239`.

### 10.1 Auth / Config

| Endpoint                  | Mètode | Auth                        | Descripció                                                                                                                                                                                                                                                     |
| ------------------------- | ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/login`         | POST   | no                          | `{ username, password }` → cookie `auth_token` + `{ user }` amb `permissions[]` i `mqtt_enabled` (`back/src/routes/auth.ts:43`)                                                                                                                                |
| `/api/auth/logout`        | POST   | no                          | Esborra cookie                                                                                                                                                                                                                                                 |
| `/api/auth/me`            | GET    | no (401 si no hi ha sessió) | Usuari actual + `mqtt_enabled` + `permissions[]`                                                                                                                                                                                                               |
| `/api/auth/access/:token` | GET    | no                          | Enllaç d'accés d'un sol ús: `{ username }` (404/410 si no existeix, ja s'ha fet servir o ha caducat)                                                                                                                                                           |
| `/api/auth/access/:token` | POST   | no                          | `{ password }` → desa la contrasenya triada per l'usuari, marca el token com a gastat i obre sessió (`{ user }`)                                                                                                                                               |
| `/api/config`             | GET    | no                          | `{ max_hydrant_move_meters, role_permissions, min_password_length }` límit de desplaçament, matriu rol → permisos i mínim de contrasenya (`back/src/routes/appConfig.ts:11`, `back/src/utils/geo.ts`, `back/src/permissions.ts`, `back/src/utils/password.ts`) |

### 10.2 ADFs / Boundaries

| Endpoint                         | Mètode | Auth | Descripció                                                                                                                                                                   |
| -------------------------------- | ------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/adfs`                      | GET    | no   | Llista ADFs amb `osm_relations`, `bbox`, `center` (`back/src/routes/municipis.ts:5`)                                                                                         |
| `/api/adf?adf=ID`                | GET    | no   | Detall ADF per ID (`back/src/routes/municipi.ts:6`)                                                                                                                          |
| `/api/adf/boundary?adf=ID`       | GET    | no   | Només `boundary_geojson` GeoJSON (`back/src/routes/boundary.ts:6`)                                                                                                           |
| `/api/adfs/:id/tracking-sharing` | PUT    | sí   | `{ shared: boolean }` — comparteix tracking amb altres ADFs; admin qualsevol, coordinador la seva (`back/src/routes/trackingSharing.ts:12`, permís `manage_own_adf_sharing`) |

### 10.3 Hidrants

| Endpoint                     | Mètode | Auth (capacitat)      | Descripció                                                                                     |
| ---------------------------- | ------ | --------------------- | ---------------------------------------------------------------------------------------------- |
| `/api/hidrants?adf=ID`       | GET    | no                    | GeoJSON hidrants ADF (`back/src/routes/hidrants.ts:48`, `Cache-Control: no-cache`)             |
| `/api/hidrants`              | POST   | sí (`create_hydrant`) | Crea hidrant local `PENDING_CREATE` `{ lat, lon, ui_fields?, private_tags? }`                  |
| `/api/hidrants/:id`          | PUT    | sí (`edit_hydrant`)   | Actualitza `{ lat?, lon?, ui_fields?, private_tags? }`; valida límit `max_hydrant_move_meters` |
| `/api/hidrants/:id?id=ID`    | DELETE | sí (`delete_hydrant`) | Marca `PENDING_DELETE` (esborra directe si era `PENDING_CREATE` o `MISSING_IN_OSM`)            |
| `/api/hidrants/sync?adf=ID`  | POST   | sí (`sync_osm`)       | Pull Overpass (vegeu §9.2)                                                                     |
| `/api/hidrants/stats?adf=ID` | GET    | no                    | Comptadors per `sync_status`                                                                   |

### 10.4 Incidències

| Endpoint                                         | Mètode | Auth                     | Descripció                                                                                                              |
| ------------------------------------------------ | ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/api/incidencies?adf=ID&incloure_tancades=true` | GET    | no                       | GeoJSON filtrat per `visibilitat` (públic només `PUBLICA`) (`back/src/routes/incidencies.ts:45`)                        |
| `/api/incidencies/:id`                           | GET    | no                       | Detall amb esdeveniments                                                                                                |
| `/api/incidencies`                               | POST   | sí (`create_incidencia`) | Crea `{ titol, tipus, prioritat?, visibilitat?, lat, lon, precisio?, comentari? }` + notifica Telegram (`appBaseUrl()`) |
| `/api/incidencies/:id/events`                    | POST   | sí (`create_incidencia`) | Afegeix esdeveniment `{ tipus_event, dades }`                                                                           |

### 10.5 Usuaris

Username `XXX/YYY` o `XXX/GI/YYY` (3 dígits, `back/src/routes/users.ts:12`), rols `admin|coordinador|voluntari`. Admin veu/toca tot; coordinador només la seva ADF i mai a si mateix.

**Contrasenyes:** ningú no en tria per un altre. En crear un usuari o en demanar un enllaç, el backend guarda el `sha256` del token a `access_tokens` i retorna **una sola vegada** `access_url` (`/acces/<token>`, TTL 7 dies en alta i 24 h en restabliment). L'usuari obre l'enllaç, hi tria la seva contrasenya i queda amb la sessió oberta. Un sol enllaç viu per usuari (`back/src/services/accessTokens.ts`). El backend exigeix **mínim 8 caràcters**, que combinin lletres i xifres, i rebutja les d'un sol caràcter repetit i les que contenen el nom d'usuari o el de l'ADF (`back/src/utils/password.ts`); la mateixa validació s'aplica a `PUT /api/auth/password` i a `npm run create:user`. El mínim no es duplica al front: es publica a `GET /api/config` (`min_password_length`) i els formularis el fan servir per a l'atribut `minLength`.

| Endpoint                     | Mètode | Auth | Descripció                                                                                                             |
| ---------------------------- | ------ | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| `/api/users`                 | GET    | sí   | Llista (abast per rol: admin tots, coordinador ADF pròpia)                                                             |
| `/api/users`                 | POST   | sí   | Crea `{ username, role }` + retorna `access_url`/`access_expires_at` (coordinador no pot crear `admin` ni d'altra ADF) |
| `/api/users/:id`             | PUT    | sí   | Edita `{ username?, role? }` — re-alinia identitat MQTT si cal (`propagateMqttRename()`)                               |
| `/api/users/:id`             | DELETE | sí   | Elimina (neteja `access_tokens`, `mqtt_users`, `incidencia_events.usuari_id→null`, `deleteMqttUser`)                   |
| `/api/users/:id/access-link` | POST   | sí   | Genera un enllaç d'accés nou (24 h) i invalida l'anterior                                                              |

### 10.6 Tracking / MQTT (OwnTracks)

Identitat aplanada `278/GI/011` → `278_GI_011` (`mqttNameFor()` a `back/src/services/mqtt.ts`).

| Endpoint                  | Mètode | Auth | Descripció                                                                                                                  |
| ------------------------- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `/api/tracking/status`    | GET    | sí   | `{ available, enabled }`                                                                                                    |
| `/api/tracking/positions` | GET    | sí   | `{ positions: { "278/GI/011": LocationData } }` — filtra `view_all_positions` / `view_shared_positions` + `tracking_shared` |
| `/api/tracking/enable`    | POST   | sí   | Crea/rota DynSec `owntracks-device`, guarda `mqtt_password_enc`, retorna `.otrc`                                            |
| `/api/tracking/config`    | GET    | sí   | Retorna `.otrc` existent (recrea client si cal, auto-cura username)                                                         |

### 10.7 Telegram per ADF

| Endpoint                        | Mètode | Auth                   | Descripció                                                                                                      |
| ------------------------------- | ------ | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/api/adfs/:id/telegram/status` | GET    | sí                     | `{ status, bot_username, bot_name, group_name }` (`NO_CONFIGURAT`/`BOT_CONFIGURAT`/`GRUP_PENDENT`/`CONFIGURAT`) |
| `/api/adfs/:id/telegram`        | POST   | sí (`manage_telegram`) | Registra bot `{ token }` → `getMe` + `setWebhook` a `${WEBHOOK_PUBLIC_URL\|Host}/api/telegram/webhook/:secret`  |
| `/api/adfs/:id/telegram`        | DELETE | sí (`manage_telegram`) | `deleteWebhook` + esborra `telegramBots`/`telegramLinks`                                                        |
| `/api/adfs/:id/telegram/link`   | POST   | sí (`manage_telegram`) | Genera `https://t.me/<bot>?startgroup=<code>` TTL 15 min, un sol ús (`sha256hex`)                               |
| `/api/adfs/:id/telegram/test`   | POST   | sí (`manage_telegram`) | Envia `{ message? }` al grup vinculat                                                                           |
| `/api/telegram/webhook/:secret` | POST   | no (secret URL)        | Webhook Telegram (vegeu §8)                                                                                     |

### 10.8 Altres

| Endpoint                             | Mètode | Auth | Descripció                                                                                                                                                                         |
| ------------------------------------ | ------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/overpass`                      | POST   | no   | Proxy Overpass `{ query }` → JSON (`back/src/routes/overpass.ts:4`, CORS `*`)                                                                                                      |
| `/api/sendToTelegram`                | POST   | no   | Envia missatge (hidrant nou/incidència/edit) a bot global + bot ADF; si hidrant nou amb `adf_id` el crea a BD (`back/src/routes/sendToTelegram.ts:17`, `ui2Osm()`, `appBaseUrl()`) |
| `/api/route?from=lat,lon&to=lat,lon` | GET    | no   | Proxy GraphHopper `vehicle=car` (`back/src/routes/route.ts:4`)                                                                                                                     |

### 10.9 Fre de força bruta (login)

`POST /api/auth/login` compta els intents fallits en memòria (`back/src/services/loginThrottle.ts`) i, quan se supera el límit, respon **429** amb la capçalera `Retry-After` i un missatge en català. Finestra lliscant de 15 minuts:

- **5 intents fallits per usuari** → aquell usuari queda bloquejat fins que caduca l'intent més antic. Un login correcte neteja el comptador.
- **30 intents fallits per IP**, només amb `TRUST_PROXY=true`. Sense proxy de confiança no es limita per IP a posta: tots els usuaris darrere del mateix proxy compartirien comptador i es bloquejarien entre ells.
- El comptador és en memòria i es perd en reiniciar el procés (no s'escriu res a la BD, així no queda rastre de credencials provades).
- Efecte col·lateral conegut: qui conegui un username pot bloquejar-lo 15 minuts fent 5 intents. Amb una ADF petita es considera acceptable; si molestés, es pot canviar a bloqueig per `usuari+IP`.

---

## 11. Qualitat de codi: ESLint, Husky i CI

- **ESLint** (flat `eslint.config.mjs`, un per `front/` i `back/`): `npm run lint` / `lint:fix` a arrel o paquet. Stack `typescript-eslint` (recommended) + `eslint-config-prettier`, `eslint-plugin-react-hooks` i `react-refresh` (front). Objectiu **0 errors, 0 warnings**. `no-console` via `front/src/utils/log.ts`; `no-explicit-any` adapter Fastify amb `eslint-disable` justificat (`back/src/server.ts:1`).
- **Husky + lint-staged** (hook pre-commit): `.husky/pre-commit` → `npx lint-staged` (ESLint `--fix` als staged). **No `--no-verify`** sense justificació. Config a `package.json:51` (`*.{ts,tsx,js,jsx}` → `eslint --fix` + `prettier`, `*.{json,md,yml}` → `prettier`).
- **CI** (`.github/workflows/ci.yml`): `push` a `main`/`develop` i `pull_request`. Pipeline Node 26: `npm ci` → `typecheck` → `lint` → `build`. Mínim: no tests ni deploy encara.

---

## 12. Troubleshooting

| Símptoma                                        | Causa / Context                                                       | Solució                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getaddrinfo ENOTFOUND mosquitto`               | `MQTT_BROKER_URL` incorrecte segons entorn                            | Dev local: `mqtt://localhost:1883`. Docker: `mqtt://mosquitto:1883`                                                                                                     |
| `Not authorized` (Mosquitto)                    | `back/.env` vs `dynamic-security.json` desincronitzats                | `npm run mqtt:sync-dynsec` (o `regen` si cal), verificar `docker compose logs mosquitto` → `Opening TLS listening socket on port 51823` (vegeu `docs/MQTT_DEPLOY.md#7`) |
| `Not authorized` amb `mosquitto_sub -u backend` | Hash `encoded_password` incorrecte / format JSON DynSec invàlid       | Regenerar amb `scripts/init-dynsec.py` (Python directe, sense `mosquitto_passwd` amb expansió shell) — detall `docs/MQTT_DEPLOY.md#4`                                   |
| `Permission denied` generant DynSec             | `mosquitto/data` propietat `root` (contenidor) sense grup `mosquitto` | `chown root:mosquitto`, `chmod 2770/660`, `setfacl -d -m g:mosquitto:rw` — vegeu `docs/MQTT_DEPLOY.md#4`                                                                |
| `docker compose config` no cal `mosquitto/.env` | Mosquitto no consumeix env en runtime                                 | Contrasenyes només a `back/.env` (`MQTT_*_PASSWORD`); el JSON és la font de veritat                                                                                     |
| Webhook Telegram `{"ok":false}` sempre          | Secret no trobat (`telegramBots.webhook_secret`)                      | Verificar `WEBHOOK_PUBLIC_URL` i que Nginx proxya `/api/telegram/webhook/*` (vegeu §8.2)                                                                                |
| `Token OSM no vàlid` / push 401                 | `OSM_ACCESS_TOKEN` invàlid o sense `write_api`                        | Regenerar a https://www.openstreetmap.org/oauth2/applications, scope `write_api`                                                                                        |

---

_Darrera actualització: generat des de `back/src/server.ts:211` (rutes), `back/.env.example`, `package.json:5` i `docs/OSM_SYNC.md` / `docs/MQTT_DEPLOY.md` / `docs/DEPLOY.md`._
