# Tests del backend

Aquesta pàgina descriu la suite de tests del backend (punt **F-08** de
`docs/AUDIT.md`), com executar-la i què cal millorar al codi perquè sigui més
fàcil de provar.

## Execució

```bash
npm test -w back           # una passada (Vitest)
npm run test:coverage -w back # tests + llindar de cobertura
npm run test:watch -w back
npm run typecheck -w back  # inclou src/ i tests/ (tsconfig.test.json)
npm run lint -w back
```

Requisits:

- **Node 26.13.0** (`.nvmrc`; `engines` i `engine-strict` fan fallar `npm install`
  amb una altra versió). Amb nvm: `nvm use`.
- **No cal `back/.env`** ni la BD de desenvolupament. La suite fixa les seves
  pròpies variables (`tests/env.ts`) i fa servir una BD SQLite temporal a
  `os.tmpdir()`. `config.ts` no llegeix `.env` quan `NODE_ENV=test`.

La suite és a `back/tests/` i **no** s'inclou al build (`tsconfig.json` només
compila `src/`). El `typecheck` sí que la revisa gràcies a
`tsconfig.test.json`.

## Com està muntada

| Peça       | Fitxer                  | Funció                                                                                 |
| ---------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Entorn     | `tests/env.ts`          | Variables dummy i camí de la BD temporal.                                              |
| Migracions | `tests/globalSetup.ts`  | Crea la BD i aplica `drizzle/` abans de cap test.                                      |
| Seguretat  | `tests/helpers/db.ts`   | `resetDatabase()` falla si `DB_PATH` no apunta a una BD `territoriadf-vitest-*`.       |
| Dades      | `tests/helpers/db.ts`   | Dues ADFs (278/279), admin, coordinador i voluntari; hidrants i incidències de mostra. |
| Sessió     | `tests/helpers/app.ts`  | `buildApp()`, `app.inject()`, login i cookie.                                          |
| Config     | `vitest.config.ts`      | Un sol worker, fitxers en sèrie, BD compartida.                                        |
| Fixtures   | `tests/fixtures/*.json` | Respostes d'Overpass amb la forma real (nodes, versions i tags).                       |

Cada fitxer fa `resetDatabase()` + `seedStandardWorld()` al `beforeEach`. Els IDs
d'usuari són estables, així que les cookies obtingudes al `beforeAll` continuen
sent vàlides després de cada reset (el JWT només porta `id` i `token_version`).

No s'obre cap port: tot passa per `app.inject()`, i `buildApp()` ja existia
(F-03) i munta plugins, guards i rutes sense `listen()`.

## Cobertura actual

**14 fitxers, 185 tests**, tots verds en ~13 s.

Cobertura mesurada (`npm run test:coverage -w back`): **61,3 % de línies**,
61,2 % de sentències, 66,4 % de funcions i 50,5 % de branques sobre `src/**`
(exclosos `src/scripts/**`, `src/server.ts` i `src/types.ts`). El CI aplica un
llindar del 55 % de línies i sentències, 60 % de funcions i 45 % de branques per
evitar regressions; és un ratchet per sobre de l'objectiu del 50 % del domini,
no l'objectiu final. Les zones crítiques tenen
molta més cobertura: `auth.ts` 86 %, `authorize.ts` 82 %, `hidrantsService.ts`
82 %, `incidenciesService.ts` 80 %, i tot el nucli OSM: `osmSync.ts` 100 %,
`osmXml.ts` 100 %, `overpass.ts` 100 %, `osmApi.ts` 98 %,
`osmConflictResolver.ts` 98 %, `routes/osm.ts` 95 %, `osmPushSync.ts` 85 % i
`osmDataValidator.ts` 98 %.

| Fitxer                        | Què prova                                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.test.ts`                | Login correcte/incorrecte, cookie `httpOnly`, `/me`, `token_version`, usuari esborrat, logout, fre de força bruta, enllaç d'accés d'un sol ús.                                                                                                                           |
| `users.test.ts`               | Matriu d'abast: admin / coordinador de la pròpia ADF / un altre coordinador / voluntari; alta, edició, esborrat, mai a un mateix, mai administradors.                                                                                                                    |
| `hidrants.test.ts`            | 401/403/404, ADF 278 contra 279, `private_tags` només amb sessió, `PENDING_CREATE`, `PENDING_DELETE`, `MISSING_IN_OSM`, `SYNCED + edició → PENDING_UPDATE`, tornar a l'original → `SYNCED`, observacions privades sense canvi d'estat, clamp de 50 m, límit territorial. |
| `incidencies.test.ts`         | Matriu de visibilitat (`PUBLICA` / `TOTES_ADFS` / `ADF_PRIVADA`), tancades, detall 404 per a alienes, creació amb visibilitat forçada per rol, permisos dels esdeveniments.                                                                                              |
| `adfs.test.ts`                | CRUD d'ADFs, 403 de coordinador, 409 amb dades associades, `/api/config`, `/healthz`, `/readyz`, OpenAPI, 404/405.                                                                                                                                                       |
| `osmPush.test.ts`             | `PENDING_CREATE → SYNCED`, esborrat a OSM, 409 → `CONFLICT`, actualització correcta, tags invàlids → `ERROR`, warnings → `REVIEW`, sense token, changeset buit. L'API d'OSM és un mock.                                                                                  |
| `osmValidator.test.ts`        | Validador de tags i `osmDiff` (funcions pures).                                                                                                                                                                                                                          |
| `osmRoutes.test.ts`           | `status`, `pending`, `discard-selected`, `missing/purge` i `push-selected`: 400/403, abast ADF, restauració de dades remotes i pujada selectiva.                                                                                                                         |
| `osmSync.test.ts`             | Pull des d'Overpass amb **fixtures**: importació, actualització de SYNCED, PENDING_CREATE intacte, CONFLICT per timestamp, restauració de MISSING, detecció de desapareguts, deduplicació per relacions, fallades parcials/totals.                                       |
| `osmConflicts.test.ts`        | Conflictes, exportació `.osc`, resolució post-JOSM, reviews, diff i `pull-hydrant` (Overpass mockejat).                                                                                                                                                                  |
| `osmConflictResolver.test.ts` | `tryAutoResolve` (sense osm_id, posició canviada, merge net, merge publicat, rebuig), `getConflicts`, `generateOscFile` i `resolveAfterJOSM`.                                                                                                                            |
| `osmApi.test.ts`              | Client HTTP d'OSM amb `fetch` stub: changeset, create/update/delete/get de nodes i parseig del 409.                                                                                                                                                                      |
| `osmXml.test.ts`              | Constructors XML: changeset, create/update/delete de node i `.osc`.                                                                                                                                                                                                      |
| `overpass.test.ts`            | Client d'Overpass: POST, User-Agent, cos de la consulta i resposta d'error.                                                                                                                                                                                              |

La matriu de casos que proposava F-08 queda coberta:

- rol × ruta → 200/401/403: sí (auth, users, hidrants, adfs, incidències).
- usuari de l'ADF 278 no pot editar dades de la 279: sí.
- `PENDING_CREATE → SYNCED`: sí (push amb API mockejada).
- `SYNCED` + edició → `PENDING_UPDATE`; tornar a l'original → `SYNCED`: sí.
- validador de tags: sí.
- conflicte 409: sí.
- `token_version` invalida la cookie: sí.
- throttle de login: sí.
- rutes OSM `pending`/`discard`/`purge`/`push-selected`: sí.
- pull d'OSM amb fixtures (importació, conflicte, MISSING, fallades parcials): sí.

### Troballes de la revisió

La revisió amb ulls nous ha detectat tres punts del codi (no de la suite). No
s'han corregit en aquest canvi perquè són decisions de producte/API:

- `GET /api/osm/status` anuncia estadístiques globals, però crida
  `getSyncStats(0)`; com que filtra per `adf_id = 0`, sempre torna zeros. El test
  comprova la forma de la resposta, no els números.
- `POST /api/osm/discard-selected` compta com a `discarded` els hidrants sense
  `remote_osm_tags`, però no els canvia l'estat (no tenen versió remota a què
  tornar). El recompte pot ser enganyós en aquest cas límit.
- `GET /api/osm/diff/:id` respon 400 (no 404) quan l'hidrant no existeix, com la
  resta de rutes OSM; és coherent amb el codi actual però no amb la semàntica
  HTTP.

### Què no es prova encara

- **Overpass real**: el pull es prova amb fixtures i el client HTTP amb `fetch`
  stub; no es fa cap consulta real durant la suite.
- **MQTT/DynSec** real i l'stream SSE de `/api/tracking/stream`.
- L'API de **Telegram** i el webhook per ADF.
- **GraphHopper** i les rutes que només fan de proxy.
- Migració de la BD antiga (`hidrants.db`).
- Concurrència real (dues escriptures simultànies, `SQLITE_BUSY`).

## Problemes del codi actual per tenir bons tests

Aquests són els punts que han obligat a fer volta o que limiten la suite. Cap és
un bloqueig absolut, però tots encareixen escriure i mantenir tests.

### 1. La BD és un singleton creat a l'import

`src/db/index.ts` obre SQLite i calcula el camí en carregar-se el mòdul. Tots els
repositoris importen aquell `db` directament (les rutes i els serveis hi arriben
a través dels repositoris). Conseqüències:

- No es pot injectar una BD per test ni fer rollback per test.
- Tots els fitxers comparteixen una BD i cal **un sol worker** (`fileParallelism: false`).
- Els tests depenen d'un `DB_PATH` global, no d'una funció.

**Mitigació feta:** `DB_PATH` permet apuntar a una altra BD i el renombratge de
la BD antiga només s'executa amb la BD per defecte. **Millora real:**
`createDatabase(path)` que retorni `{ db, sqlite }`, i repositoris construïts amb
aquella instància (`createHidrantsRepository(db)`), no amb un import global.

### 2. `config.ts` llegeix `.env` i fa `process.exit(1)` en importar-se

Qualsevol test que importi una ruta arrossega `config.ts`. Si faltava una
variable, el worker de Vitest hauria mort amb `process.exit(1)` en lloc de
mostrar un error de test.

**Mitigació feta:** amb `NODE_ENV=test` no es llegeix `back/.env` i les
variables es fixen a `tests/env.ts`. **Millora:** separar `loadConfig(env)` (pur,
retorna `Result`) de l'arrencada; que només `server.ts` decideixi sortir amb
codi 1.

### 3. Efectes de xarxa dins de serveis que es poden importar

`osmPushSync` crida `fetch` a OSM, `incidenciesService` dispara Telegram amb
`void sendTelegramMessage(...)`, i `mqtt.ts` crea un client en arrencar el
servei. Els tests han de **mockejar mòduls sencers** (`vi.mock("../src/services/osmApi.js")`),
la qual cosa acobla el test a la ruta interna d'import.

**Millora:** ports/adapters injectats (`OsmGateway`, `Notifier`, `MqttGateway`,
`fetch` injectable) i implementacions no-op o fake als tests. Així el test
decideix el comportament sense conèixer la ruta del mòdul.

### 4. La lògica de negoci viu barrejada amb HTTP, SQL i notificacions

`osmPushSync.ts` fa des del changeset fins a Telegram; `users.ts` barreja bcrypt,
SQL, MQTT i tokens d'accés; `incidenciesService.ts` crea la incidència i envia
notificacions dins la mateixa funció. Els tests acaben sent d'integració (bo per
a la xarxa de seguretat, dolent per localitzar errors).

**Millora:** serveis de domini amb funcions pures per a la màquina d'estats
(`nextHydrantStatus(...)`, `planPush(...)`) i handlers que només tradueixen HTTP.
El push llarg hauria de ser un job (F-09), cosa que faria els tests molt més
naturals.

### 5. Temps, aleatorietat i cost de bcrypt no injectats

`new Date()`, `randomUUID()`, `Date.now()` del throttle i el cost 10 de bcrypt
estan incrustats. Per provar la caducitat d'una cookie o la finestra de 15 minuts
caldria esperar o tocar mòduls.

**Mitigació feta:** els usuaris de test es creen amb un hash de cost 4 (el login
compara contra el hash desat, així que el test és ràpid). **Millora:** rellotge i
generador d'IDs injectats; el throttle com a classe amb `now` injectable.

### 6. Estat global de mòdul

`loginThrottle` té un `Map` i un `setInterval` a nivell de mòdul;
`health.ts` cacheja el journal de migracions; `mqttService` és un singleton.
Aquest estat sobreviu entre tests del mateix worker (per això el test del
throttle usa un username propi) i impedeix paral·lelitzar.

**Millora:** estat dins de l'aplicació (`app.decorate`) o classes amb `dispose()`
i `reset()`; res a nivell de mòdul.

### 7. `requireAdfScope` és permissiu si falta l'ADF

El guard deixa passar quan la petició no porta ADF i delega la decisió al
handler. Això vol dir que la regla de seguretat no és local al `preHandler`: per
saber què passa sense `?adf=` cal llegir cada handler. A la suite es prova
(400/404), però el contracte és més difícil d'auditar.

**Millora:** que el guard declari si l'ADF és obligatòria i respongui 400 ell
mateix; els handlers no haurien de repetir la comprovació.

### 8. Errors sense codi estable

`AppError` només té `statusCode` i un missatge en català. Els tests han
d'afirmar textos ("gestionar aquest usuari", "fora del límit") i qualsevol
reformulació els trenca.

**Millora:** `code` estable (`HYDRANT_NOT_FOUND`, `ADF_FORBIDDEN`,
`OSM_CONFLICT`) i missatge per a la UI; el test asserta el codi.

### 9. Accés a dades centralitzat als repositoris

Totes les taules passen per `src/db/repositories/` (`adfs`, `hidrants`,
`incidencies`, `users`, `mqttUsers`, `accessTokens` i `telegram`): rutes, serveis
i plugins no importen `db` ni l'esquema. Els scripts de `src/scripts/` en són
l'excepció deliberada: són eines d'operació que treballen sobre la BD crua.

**Millora pendent:** injectar la connexió (`createDatabase(path)` i repositoris
construïts amb aquella instància) per poder provar cada repositori amb una BD
temporal; avui tots importen el singleton.

### 10. `buildApp()` no accepta dependències

`buildApp()` llegeix `config` i `logger` globals i registra les rutes reals. No es
pot canviar el logger (la suite el posa a `silent` per env), ni injectar un
servei fals, ni desactivar OpenAPI.

**Millora:** `buildApp({ config, logger, deps })` amb valors per defecte; els
tests passen dobles i l'aplicació de producció no canvia.

### 11. Les migracions no són una funció reutilitzable

`scripts/migrate.ts` importa el singleton, tanca la connexió i fa
`process.exitCode = 1`; el `globalSetup` ha de duplicar la lògica (obrir SQLite,
desactivar FK, cridar el migrador). Si canvia el procediment, hi ha dos llocs.

**Millora:** exportar `runMigrations(sqlite, folder)` des de `src/db/migrate.ts` i
fer-lo servir tant al script com al setup dels tests.

## Com millorar-ho, per ordre

1. **`createDatabase(path)` + `buildApp({ deps })`** (1–2 dies). És el canvi que
   desbloqueja tests per fitxer, rollback i paral·lelisme.
2. **Ports per a OSM, Telegram, MQTT i rellotge** (2–3 dies). Elimina els
   `vi.mock` de mòduls i fa els tests llegibles.
3. **Extreure el push d'OSM a un job** (F-09, 3–5 dies). La màquina d'estats es
   prova com a funció pura i el handler només encua.
4. **Codis d'error estables** (1 dia) i assercions per codi.
5. **Pujar el llindar de cobertura** (mig dia per esglaó): ara és 45/45/50/35
   (línies/sentències/funcions/branques); l'objectiu del full de ruta és 50 % al
   domini del back, sense exigir 100 %. `test:coverage` i el proveïdor v8 ja
   estan configurats i el CI els executa.
6. **Més fixtures d'Overpass** (mig dia): nodes sense tags, respostes grans o
   malformades; el circuit bàsic (importació, conflicte, MISSING, fallades
   parcials) ja està cobert.

Mentrestant, la suite actual és una xarxa de seguretat real per als canvis de
permisos, abast ADF, autenticació i màquina d'estats d'OSM: són precisament les
zones on l'auditoria deia que no n'hi havia cap.

## Convencions per afegir tests

- Fitxer a `back/tests/<àrea>.test.ts`; helpers a `back/tests/helpers/`.
- `resetDatabase()` + `seedStandardWorld()` al `beforeEach`.
- Login al `beforeAll` amb els IDs estables; no repetir logins a cada test.
- Cap crida de xarxa, cap `sleep` i cap dependència de l'ordre dels fitxers.
- Afirma estat HTTP **i** l'estat a la BD quan el test tracta una transició.
- Si una funcionalitat necessita un servei extern, mockeja'l a la frontera del
  mòdul i comprova que se l'ha cridat (o no) amb els arguments esperats.
