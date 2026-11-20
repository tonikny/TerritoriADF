# Auditoria d'arquitectura — TerritoriADF

**Data:** 19 de novembre de 2026
**Commit auditat:** `b7c5f4e` (`main`, arbre de treball net)
**Abast:** `front/`, `back/`, `scripts/`, Docker/Nginx/CI, documentació i arxius de context per a agents.
**Estat de partida:** `npm run typecheck`, `npm run lint` i `npm test -w front` passen (4 fitxers, 16 tests, 152 ms).

> Aquest document és una **auditoria i una proposta**. No s'hi ha aplicat cap canvi de codi. Els números de línia són del commit indicat i, per tant, es poden desplaçar: els que hi ha a `docs/DEV.md` ja estan desfasats (vegeu F-12).

---

## 0. Resum executiu

TerritoriADF és un projecte **madur en el domini i en la seguretat**, i **jove en la capa HTTP i en la gestió d'estat del front**. La feina feta en els motors de mapa, la matriu de permisos, la màquina d'estats d'OSM, la PWA offline i l'enduriment de Docker/Nginx és molt per sobre del que és habitual en un projecte d'aquesta mida. El deute no ve d'haver triat malament les tecnologies, sinó d'haver acumulat **punt d'entrada únic** (`server.ts`), **contractes duplicats** (front i back) i **components que fan de contenidor, de domini i de vista alhora**.

La bona notícia: les millores amb més impacte són **incrementals i de baix risc**. No cal reescriure res. Cal **separar costures** que ja existeixen al domini.

### 0.1 Valoració per àrea

Escala 1–5, relativa a un projecte de 20k línies d'aquest tipus (no és una nota acadèmica).

| Àrea                              | Nota | Comentari                                                                                                 |
| --------------------------------- | :--: | --------------------------------------------------------------------------------------------------------- |
| Domini i regles de negoci         | 4,0  | Estats d'OSM, validació de tags, permisos per capacitat i abast ADF ben pensats.                          |
| Abstracció del mapa               | 4,5  | Contracte neutral, `EngineCapabilities`, aïllament per ESLint i tests. És el millor tros del codi.        |
| Seguretat                         | 3,8  | Cookies httpOnly, `token_version`, throttle de login, CSP/rate limit a Nginx, contenidors endurits.       |
| Capa HTTP del backend             | 2,0  | Adapter Express sobre Fastify, 46 rutes en una taula, autorització per `url.includes(...)`.               |
| Modularitat del backend           | 2,5  | Serveis i repositoris existeixen, però rutes i serveis barregen HTTP, SQL, MQTT i Telegram.               |
| Contracte front/back              | 1,5  | Tipus, enums, estats i conversions OSM duplicats a mà.                                                    |
| Gestió d'estat i data layer front | 2,0  | 50 `fetch` en 19 fitxers, sense client comú, sense caché ni invalidació.                                  |
| Mida i cohesió de components      | 2,5  | 7 components > 400 línies; `MapPanel` 812 línies amb 7 `useEffect`.                                       |
| Tests                             | 1,5  | 16 tests, tots de funcions pures del mapa/conversió. Zero tests de backend, permisos o sincronització.    |
| Observabilitat                    | 2,0  | Pino estructurat, però sense `/healthz`/`/readyz`, sense redacció de secrets ni mètriques.                |
| Documentació                      | 3,5  | Molta i bona, però monolítica, duplicada i amb referències que caduquen.                                  |
| CI/CD                             | 3,0  | Pipeline verd i útil; falta tests de backend, cobertura, build d'imatges i validació de docs.             |
| Context per a LLMs                | 1,5  | `AGENTS.md` **no es versiona**; `GEMINI.md` és una còpia idèntica; les skills d'OpenCode també s'ignoren. |

### 0.2 Les 10 accions amb més impacte

| #   | Acció                                                               | Per què                                        | Esforç   |
| --- | ------------------------------------------------------------------- | ---------------------------------------------- | -------- |
| 1   | Versionar `AGENTS.md` i fer-ne la font única (F-01)                 | Sense això, un clon net no té instruccions     | 1–2 h    |
| 2   | Activar `PRAGMA foreign_keys = ON` i auditar orfes (F-02)           | Integritat referencial real                    | 2–4 h    |
| 3   | Extreure `buildApp()` de `server.ts` (F-03)                         | Fa testable tot el backend                     | 1–2 dies |
| 4   | Rutes natives de Fastify amb esquema Zod + `preHandler` (F-04/F-18) | Validació, OpenAPI i permisos declaratius      | 3–5 dies |
| 5   | Paquet `packages/contracts` (F-05)                                  | Elimina la deriva front/back                   | 3–5 dies |
| 6   | Client API + TanStack Query al front (F-06)                         | Elimina 50 `fetch` dispersos i errors repetits | 3–5 dies |
| 7   | Tests de backend amb `fastify.inject()` (F-08)                      | La lògica crítica no té xarxa de seguretat     | 5–8 dies |
| 8   | Jobs per al push d'OSM (F-09)                                       | Evita timeouts, dobles pujades i estat penjat  | 3–5 dies |
| 9   | Descompondre `MapPanel` en hooks i builders purs (F-07)             | Menys regressions i codi testable              | 3–4 dies |
| 10  | `/healthz`, `/readyz`, redacció de logs i Litestream (F-13/F-20)    | Operació sense caigudes invisibles             | 1–2 dies |

### 0.3 Full de ruta resumit

| Fase                      | Durada orientativa | Resultat                                                                                    |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| **Fase 0 — sanejament**   | 2–3 dies           | `AGENTS.md` versionat, `foreign_keys`, healthchecks, dependències mortes, `docs:check`.     |
| **Fase 1 — costures**     | 2 setmanes         | `buildApp()`, rutes natives pilot (hidrants/incidències), contracts, TanStack Query pilot.  |
| **Fase 2 — consolidació** | 4–6 setmanes       | Totes les rutes migrades, jobs OSM, posicions persistides, JSON tipat, OpenAPI, tests back. |
| **Fase 3 — producte**     | Trimestre          | Decisió Leaflet, PMTiles offline, imatges immutables a CI, observabilitat i accessibilitat. |

---

## 1. Abast i mètode

S'han llegit:

- Els 66 fitxers de `back/src` i els 128 de `front/src`, amb atenció especial a `server.ts`, `permissions.ts`, `db/schema.ts`, els repositoris, els serveis d'OSM/MQTT/Telegram i la capa de mapa.
- `docker-compose.yml`, els dos `Dockerfile`, `front/nginx.conf`, `config/site-docker.nginx.example`, `scripts/deploy/update.sh`, `scripts/backup/backup.sh`.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEV.md`, `docs/DEPLOY.md`, `AGENTS.md`, `GEMINI.md`, `opencode.json`, `.opencode/skills/`.
- Configuració d'ESLint, Prettier, TypeScript, Vitest, Vite/PWA i CI.

S'han executat les comprovacions de salut del repositori (annex A). No s'ha iniciat el servidor ni s'ha provat la UI en navegador: l'auditoria és estàtica més les comprovacions de build/tests.

---

## 2. Fotografia actual

### 2.1 Mètriques

| Mètrica                                         | Valor                                                     |
| ----------------------------------------------- | --------------------------------------------------------- |
| Línies TS/TSX/CSS                               | 21.889 (front 13.040, back 8.849)                         |
| Fitxers font                                    | 194 (front 128, back 66)                                  |
| Rutes API declarades a `server.ts`              | 46                                                        |
| Crides `fetch()` al front                       | 50, en 19 fitxers                                         |
| `JSON.parse` manual al back                     | 35                                                        |
| Fitxers que importen Zod al back                | 5 de 66                                                   |
| Components front > 400 línies                   | 7                                                         |
| Fitxers back > 250 línies                       | 11                                                        |
| Tests                                           | 4 fitxers, 16 tests (tots al front)                       |
| `any` al back                                   | 18 coincidències, concentrades a `types.ts` i `server.ts` |
| `any` al front                                  | 0                                                         |
| `console.*` al front                            | 3                                                         |
| Node local / `.nvmrc` / `engines` / CI / Docker | 24.15.0 / 26.13.0 / `>=26` / 26 / `node:26-alpine`        |

### 2.2 Stack

- **Front:** React 19, Vite 8, TypeScript 6, Tailwind 4, MapLibre GL 6 + `@vis.gl/react-maplibre`, Leaflet 1.9 + React Leaflet 5, Vitest 5, `vite-plugin-pwa`.
- **Back:** Fastify 5, TypeScript 6, Drizzle ORM 0.45, better-sqlite3 13, Zod 4, `@fastify/jwt` + `@fastify/cookie`, MQTT 5, `xmlbuilder2`.
- **Infra:** Docker Compose, Nginx, Mosquitto 2 amb DynSec, scripts de backup i desplegament propis.

### 2.3 Què ja està bé (i no s'ha de tocar sense motiu)

1. **Contracte neutral del mapa.** `front/src/map/core/types.ts` + `registry.ts` + `EngineCapabilities` + `no-restricted-imports` és una arquitectura de plugin ben resolta. Els adaptadors només pinten; l'estat viu a l'aplicació. Això és exactament el que cal per poder canviar de motor o degradar sense tocar la UI.
2. **Permisos per capacitat i abast ADF.** `back/src/permissions.ts` és la font única, el front rep la matriu per `/api/config` en lloc de duplicar-la, i cada petició rellegeix rol/ADF de la BD (`sessionUser`), amb `token_version` per invalidar sessions. Molt sòlid.
3. **Màquina d'estats d'OSM.** Els vuit estats, la distinció entre canvi local i canvi remot, el `remote_*` per al diff, la validació i els conflictes 409 són domini real, no un CRUD.
4. **PWA i offline.** Estratègia explícita: NetworkFirst per a dades, CacheFirst per a tessel·les, denylist d'`/api/auth`, neteja de caché en logout/401. Poques apps de camp ho fan tan bé.
5. **Enduriment d'execució.** `read_only`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit`, usuari no-root, volums de dades, healthchecks. Nginx amb CSP, HSTS, `X-Frame-Options` i `limit_req` per login/API.
6. **Desplegament amb musculació.** `scripts/deploy/update.sh` fa backup, `git pull --ff-only`, build abans de tocar contenidors, espera de healthchecks i deixa una pista de rollback.
7. **Comentaris que expliquen el perquè.** El codi documenta decisions (per què `PENDING_CREATE` s'esborra en lloc de marcar-se, per què el zoom es desplaça 1, per què la identitat MQTT aplana les `/`). Això val or.
8. **Documentació de domini.** `docs/OSM_SYNC.md`, `docs/PWA.md`, `docs/MQTT_DEPLOY.md` i `docs/ARCHITECTURE.md` són útils i estan ben estructurats.

---

## 3. Troballes

Severitat: **S1** = corregeix aviat (integritat, seguretat o bloqueig de manteniment); **S2** = deute que encareix cada canvi; **S3** = millora d'operació o qualitat.

### 3.1 Crítiques (S1)

#### F-01 · `AGENTS.md` i `GEMINI.md` no es versionen

**Evidència**

- `.gitignore:41` ignora `*.md`; només es desbloquegen `README.md` i `docs/**`.
- `git check-ignore -v AGENTS.md` → `.gitignore:41:*.md`.
- `git ls-files '*.md'` no llista ni `AGENTS.md` ni `GEMINI.md`.
- `GEMINI.md` és, avui, **idèntic** a `AGENTS.md` (`diff` buit), però tots dos són fora del repositori.
- `docs/ARCHITECTURE.md` enllaça `../AGENTS.md`, que en un clon net no existeix: **enllaç trencat**.

**Per què importa**
Un clon nou, un CI amb agent o un col·laborador no reben cap instrucció. Les dues còpies divergiran sense que ningú ho vegi, i la documentació que explica les regles del projecte és l'única que no viatja amb el codi.

**Proposta**
Substituir `*.md` per una llista explícita de fitxers temporals (per exemple `NOTES.md`, `scratch/**`) i versionar `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md` i els ADR. Deixar una sola font canònica i generar o enllaçar les variants (vegeu §7).

**Esforç:** 1–2 h.

---

#### F-02 · Les claus foranes de SQLite no s'apliquen

**Evidència**

- `back/src/db/index.ts:58-61`: s'obre la BD i només s'executa `PRAGMA journal_mode = WAL`.
- SQLite desactiva `foreign_keys` per defecte **a cada connexió**; les `.references()` de Drizzle són metadades per generar migracions, no una garantia d'execució.
- El codi compensa manualment: `back/src/routes/users.ts` esborra `access_tokens`, `mqtt_users` i posa a `NULL` `incidencia_events.usuari_id` abans d'esborrar l'usuari. Això confirma que la BD no ho fa sola.

**Per què importa**
Es poden crear hidrants d'una ADF inexistent, incidències òrfenes o enllaços de Telegram penjant. Les migracions amb `ON DELETE` no tenen efecte runtime. És un forat silenciós d'integritat.

**Proposta**

1. Executar `PRAGMA foreign_keys = ON` immediatament després d'obrir la connexió, i `busy_timeout = 5000`, `synchronous = NORMAL`.
2. Abans d'activar-ho, `PRAGMA foreign_key_check` sobre una còpia de la BD de producció per llistar orfes i decidir-ne la neteja.
3. Definir `onDelete` explícit a l'esquema (`cascade` per a fills propis, `set null` per a referències històriques) i regenerar migracions.
4. Afegir un test que intenti inserir una FK inexistent i esperi error.

**Esforç:** 2–4 h (més la revisió de dades).

---

#### F-03 · `server.ts` concentra bootstrap, adapter HTTP, autenticació, autorització i registre de rutes

> **Estat (20/11/2026): resolt.** `buildApp()` viu a `back/src/app.ts` i no escolta cap port; `server.ts` només fa bootstrap. L'autenticació és a `back/src/plugins/auth.ts`, els guards a `back/src/plugins/authorize.ts` i cada ruta declara `requireAuth`/`requirePermission`/`requireAdfScope` al seu `preHandler` (sense `url.includes` ni `app.all`). `view_sync_status` protegeix les lectures d'OSM i els mètodes no permesos responen 405 amb `Allow`.

**Evidència**

- `back/src/server.ts` té 387 línies: `ResAdapter` (80), `createRes` (120), `sessionUser` (177), `wrap` (204), la matriu de permisos per substring (227), la taula de 46 rutes (280) i l'arrencada (344).
- L'autorització es decideix amb `url.includes("/incidencies")`, `url.includes("/hidrants")` i `url.includes("/api/osm")` (`server.ts:227-241`). No hi ha declaració per ruta.
- `app.all(...)` (`server.ts:334`) fa que tots els mètodes arribin al handler; els 405 es retornen a mà i de manera desigual.
- `void start()` s'executa en importar el mòdul i s'hi registren `SIGINT`/`SIGTERM`: **no es pot fer `app.inject()` en un test** sense arrencar un port.

**Per què importa**

- Afegir una ruta no obliga a declarar-ne el permís; el permís s'hereta per coincidència de text. Una ruta nova sota `/api/users` o `/api/adfs/:id/telegram` no té cap `required` i la protecció queda només a dins del handler (dues autoritzacions diferents).
- `view_sync_status` existeix a la matriu però no s'usa enlloc del backend, perquè tot `/api/osm` exigeix `sync_osm`: una capacitat morta i un comportament probablement més restrictiu del que es volia.
- És el principal bloqueig per testar el backend.

**Proposta**
Separar en `app.ts` (fàbrica `buildApp()` que retorna la instància), `server.ts` (llegeix config, `listen`, senyals) i plugins (`auth`, `authorize`, `errors`, `security`). Cada ruta declara el seu contracte:

```ts
app.post(
  "/api/hidrants",
  {
    preHandler: [requireAuth, requireAdfScope({ permission: "create_hydrant", from: "body" })],
    schema: { body: createHydrantSchema },
  },
  createHydrant,
);
```

**Esforç:** 1–2 dies la fàbrica; 3–5 dies la migració de totes les rutes.

---

### 3.2 Importants (S2)

#### F-04 · Adapter Express sobre Fastify: es renuncia a validació, serialització i OpenAPI

> **Estat (20/11/2026): resolt.** Totes les rutes són handlers natius amb esquemes Zod (`fastify-type-provider-zod`); `plugins/legacy.ts`, els tipus `ApiRequest`/`ApiResponse`/`ApiHandler` i la taula de rutes antigues de `routes/index.ts` s'han eliminat. `ui_fields`, `private_tags` i el cos d'esdeveniments ja no són `z.any()`, i els errors de validació responen 400 amb el detall dels camps. `GET /api/openapi.json` i `GET /api/docs` publiquen l'esquema complet (48 paths, 59 operacions), incloent-hi autenticació, tracking (SSE) i OSM. Els esquemes de `/api/users` i `/api/adfs` són el contracte real (enum de rols, patró del username, ID 1..999, camps obligatoris) i els missatges de validació surten en català.

**Evidència**

- (Abans) `back/src/types.ts` definia `ApiRequest`/`ApiResponse` amb `query`, `body`, `params` i `headers` com a `any`, i `server.ts:1` i `types.ts:1` desactivaven explícitament les regles `no-unsafe-*` per aquest motiu; tots dos s'han eliminat.
- Només 5 fitxers de 66 importen Zod. A `routes/hidrants.ts` la validació és `z.any()` per a `ui_fields` i `private_tags`; a `routes/incidencies.ts` passa el mateix amb part del cos.
- No hi ha JSON Schema de ruta: Fastify no pot validar ni serialitzar amb `fast-json-stringify`, i no hi ha OpenAPI.

**Per què importa**
Els errors de forma entren fins al servei i esclaten com a 500 o com a dades corruptes; el client no té contracte; cada canvi de camp requereix tocar front, back i proves a mà.

**Proposta**
Migrar a handlers natius amb `fastify-type-provider-zod` (o TypeBox) i `@fastify/swagger` + `@fastify/swagger-ui`. Validar a la frontera i deixar que els tipus es derivin de l'esquema. És també el camí per generar el client del front i l'`openapi.json` que consumeixen els LLMs.

**Esforç:** 3–5 dies (pilot hidrants/incidències) + migració incremental.

---

#### F-05 · Contracte duplicat entre front i back

**Evidència**

- `front/src/types.ts` i `back/src/types.ts` defineixen les mateixes `Incidencia`, `IncidenciaEvent`, estats, prioritats, precisions i visibilitat, amb noms i camps repetits a mà.
- `front/src/utils/osmConversion.ts` (155 línies) i `back/src/utils/osmConversion.ts` (150 línies) fan la mateixa conversió OSM ↔ UI. El test `front/src/utils/osmConversion.test.ts` només cobreix la còpia del front.
- La unió `SyncStatus` apareix a `db/schema.ts`, `hidrantsRepository.ts` i la UI; els permisos es repeteixen com a literals al front (`"sync_osm"`, `"create_hydrant"`…).
- `front/src/hooks/useHidrantData.ts` declara a mà la forma del GeoJSON del back.

**Per què importa**
És la causa número u de regressions silencioses: canvia un tag o un estat al back i el front continua compilant amb la forma antiga. Els tests no ho detecten perquè proven còpies.

**Proposta**
Crear un workspace `packages/contracts` amb Zod com a font única: esquemes d'entrada/sortida, `z.infer`, constants (`SYNC_STATUSES`, `ROLES`, `PERMISSIONS`) i la matriu de permisos. Back i front l'importen; les conversions OSM hi viuen. Alternativa/complement: generar el client a partir de l'OpenAPI.

**Esforç:** 3–5 dies (hidrants, incidències, ADF, usuaris) + ajustar Docker/tsconfig.

---

#### F-06 · No hi ha capa d'API al front: 50 `fetch` en 19 fitxers

**Evidència**

- `OsmSyncPanel` 9 crides, `TelegramConfigPanel` 5, `SeguimentTab` 4, `useIncidencies` 4, `HydrantSyncActions` 4, `AdfContext` 3, `AuthContext` 3, `MapaTab` 3, `useHydrantActions` 3…
- Cada lloc repeteix `if (!response.ok) throw new Error(...)`, `response.json()` i el seu propi estat `loading/error`.
- No hi ha `AbortController` general, ni deduplicació, ni reintents, ni invalidació de caché. L'únic guard és un `requestIdRef` a `useHidrantData`.
- L'offline es basa en el service worker i en `markDataSynced()`; no hi ha cua de mutacions.

**Per què importa**
Errors inconsistents, peticions duplicades en canviar d'ADF, pantalles que no es refresquen després d'una edició i codi de càrrega repetit a cada panell. És també el motiu pel qual els components són grossos.

**Proposta**

1. `shared/api/client.ts`: `request<T>()` amb base URL, `credentials`, `AbortSignal`, errors tipats (`ApiError` amb `status` i `code`), `Content-Type` i paràmetres.
2. Un `api.ts` per feature amb funcions pures (`getHidrants(adfId, signal)`, `updateHidrant(...)`).
3. **TanStack Query** per a estat de servidor: `queryKey: ["hidrants", adfId]`, `staleTime`, reintents, `invalidateQueries` després de mutar, `keepPreviousData`, offline integrat.
4. Deixar el service worker per a GET offline i afegir una **outbox** (IndexedDB) per a mutacions fetes sense xarxa.

**Esforç:** 3–5 dies el pilot; la resta, incremental.

---

#### F-07 · Components monolítics i estat dispers

**Evidència**

| Fitxer                                       | Línies | Responsabilitats                                                            |
| -------------------------------------------- | -----: | --------------------------------------------------------------------------- |
| `components/layout/MapPanel.tsx`             |    812 | selecció, creació, motor, capes, marcadors, focus, deep links, persistència |
| `components/osm/OsmSyncPanel.tsx`            |    679 | estat de sync, crides, taula, accions, confirmacions                        |
| `components/panel/tabs/UsuarisTab.tsx`       |    645 | llistat, alta, edició, enllaços d'accés, permisos                           |
| `components/shared/TelegramConfigPanel.tsx`  |    579 | assistent per passos, API, errors                                           |
| `components/panel/tabs/MapaTab.tsx`          |    461 | filtres, llistat, estadístiques                                             |
| `components/panel/tabs/SeguimentTab.tsx`     |    429 | posicions, filtres, mapa                                                    |
| `components/hidrants/HydrantSyncActions.tsx` |    404 | accions OSM, estats, feedback                                               |

`MapPanel` té 7 `useEffect`, més de 10 `useState` i construeix marcadors/polígons/línies en `useMemo` de 100+ línies (`MapPanel.tsx:463-638`).

**Per què importa**
Cada canvi de UI obliga a entendre 800 línies; els tests de component són impossibles; els `useEffect` interactuen entre si (motor, vista, selecció, URL, permisos). És el principal cost de manteniment del front.

**Proposta**

- Extreure hooks de comportament: `useMapSelection`, `useMapCreation`, `useMapEngine`, `useMapLayers`, `useMapDeepLinks`, `useMapFocus`.
- Moure els builders de `markers`/`polygons`/`polylines` a `map/core/builders.ts` com a funcions pures i testar-les.
- Dividir els panells en contenidor (dades) + vista + subcomponents per pas/fila.
- Estat: `useReducer` per a la màquina d'estat del mapa; TanStack Query per a dades; opcionalment Zustand per a capes/visibilitat si el prop drilling continua.

**Esforç:** 3–4 dies `MapPanel`; 1 dia per panell gran.

---

#### F-08 · Cobertura de tests mínima i CI sense backend

**Evidència**

- 4 fitxers, 16 tests: `zoom`, `geometry`, `engineSelection`, `osmConversion`. Tots de funcions pures.
- `docs/ARCHITECTURE.md` encara diu “3 fitxers i 13 tests” (desactualitzat).
- Zero tests de permisos, ADF, OSM, auth, repositoris o rutes.
- CI: `npm ci` → `typecheck` → `lint` → `npm test -w front` → `build`. No corre tests de back (no n'hi ha), ni cobertura, ni `prettier --check`, ni build d'imatges.

**Per què importa**
La lògica més delicada (estats d'OSM, abast ADF, `token_version`, throttle, webhook de Telegram) no té cap xarxa. Un refactor com els proposats aquí sense tests és un salt al buit.

**Proposta**

- Back: Vitest + `app.inject()` sobre `buildApp()`, BD temporal per test, migracions aplicades al `beforeAll`.
- Matriu de casos: rol × ruta → 200/401/403; usuari ADF 278 no pot editar 279; `PENDING_CREATE` → `SYNCED`; `SYNCED` + edició → `PENDING_UPDATE`; tornar a l'original → `SYNCED`; validador de tags; conflicte 409; token_version invalida cookie; throttle de login.
- Front: Testing Library per a `useHidrantData`, `OsmSyncPanel` i `UsuarisTab`; MSW per a la xarxa.
- Cobertura amb llindar progressiu (no 100%): 50% al domini del back, 70% a `map/core`, i ràtio que no baixi.
- CI: feines separades `lint`, `typecheck`, `test-back`, `test-front`, `build`, `docs`.

**Esforç:** 5–8 dies per arribar a una base útil.

---

#### F-09 · El push d'OSM corre dins la petició HTTP

**Evidència**

- `back/src/services/osmPushSync.ts` (499 línies) recorre els pendents i crida l'API d'OSM de manera seqüencial (`processCreate`, `processUpdate`, `processDelete`), amb notificacions de Telegram al final.
- `POST /api/osm/push-sync` espera el resultat complet. No hi ha job, ni progrés, ni idempotència, ni represa.
- Si Nginx o el mòbil talla la connexió, el servidor continua treballant però el client no ho sap; un segon clic pot duplicar la feina.

**Per què importa**
Amb una ADF gran o l'API d'OSM lenta, la petició pot superar timeouts, i l'usuari no té manera de saber què s'ha pujat. És el pitjor lloc per tenir una operació llarga.

**Proposta**
Taula `jobs` (`id`, `type`, `adf_id`, `payload`, `status`, `progress`, `error`, `idempotency_key`, timestamps) + worker en procés amb `p-queue` (concurrència 1 per ADF). `POST` retorna `202 { jobId }`; `GET /api/osm/jobs/:id` i SSE de progrés; `Idempotency-Key` per evitar dobles enviaments. En arrencar, els jobs `RUNNING` es reconcilien mirant `osm_version`, no es refan a cegues.

**Esforç:** 3–5 dies.

---

#### F-10 · Les posicions MQTT només viuen en memòria

**Evidència**

- `back/src/services/mqtt.ts:59`: `private positions = new Map<string, LocationData>()`; es buida en desconnectar (`:90`) i es poda cada 2 minuts.
- No hi ha taula de posicions ni historial. Un reinici del backend deixa el mapa sense unitats fins que cada dispositiu torna a publicar.
- L'stream SSE obre un `setInterval` de 5 s per client i tanca als 5 minuts (`routes/tracking.ts`).

**Per què importa**
En una emergència, reiniciar el backend no hauria de fer desaparèixer les posicions. A més, sense historial no es pot respondre “per on ha passat aquesta unitat”.

**Proposta**
Taula `positions` (última posició per usuari, `updated_at`, bateria, precisió) i, opcionalment, `position_history` amb retenció. Escriure amb debounce (per exemple cada 10–15 s o en canvi significatiu) per no castigar SQLite; mantenir el `Map` com a caché calenta. Si el nombre de clients creix, un únic `EventEmitter` compartit substitueix els timers per connexió.

**Esforç:** 2–3 dies.

---

#### F-11 · Columnes JSON com a text i validació feble

**Evidència**

- `db/schema.ts` declara com a `text()` `osm_tags`, `private_tags`, `bbox`, `center`, `osm_relations`, `sync_error`, `dades` i `remote_osm_tags`.
- 35 `JSON.parse` manuals al back, amb helpers que empassen qualsevol error i retornen `{}` (`hidrantsService.parseJsonObject`). Una fila corrupta es converteix en dades vàlides buides.
- Els tipus de `sync_error` es declaren a mà a la UI i al servei.

**Per què importa**
No hi ha validació d'esquema en llegir; els errors de dades es tornen invisibles. A més, cada `JSON.parse` és una oportunitat de 500.

**Proposta**

- `text("osm_tags", { mode: "json" }).$type<Record<string, string>>()` (Drizzle serialitza/deserialitza sol).
- `$type` per a `bbox: [number, number, number, number]`, `center: [number, number]`, `osm_relations: string[]`.
- Zod per a `sync_error` (unió discriminada: conflicte, revisió, error) i per a `dades` d'esdeveniments.
- `SYNC_STATUSES` com a `as const` al paquet de contractes, i el tipus derivat.
- Migració de dades amb un script que validi i reporti files no conformes abans de canviar el tipus.

**Esforç:** 2–4 dies.

---

#### F-12 · Documentació monolítica i referències fràgils

**Evidència**

- `docs/DEV.md` 566 línies, `docs/DEPLOY.md` 594, `docs/MIGRATION.md` 476, `docs/DOMAIN_CHANGE.md` 307. Barregen guia ràpida, referència d'API, troubleshooting i decisions.
- `docs/DEV.md` cita `back/src/server.ts:164` per a `wrap()` i `:239` per a la definició de permisos; al commit actual `wrap()` és a la línia 204 i la matriu a la 227. Les línies han quedat desfasades.
- `docs/ARCHITECTURE.md` diu 3 fitxers/13 tests; n'hi ha 4/16.
- `AGENTS.md` repeteix la llista de comandes i part de l'arquitectura que ja són a `README.md`/`DEV.md`.

**Per què importa**
La documentació que menteix és pitjor que no tenir-ne: els humans i els agents hi confien. Les referències `fitxer:línia` caduquen a cada commit.

**Proposta**

- Prohibir les referències `fitxer:línia` a la documentació; citar símbols (`wrap()` a `server.ts`) o enllaços a codi.
- Dividir per tasca: `docs/dev/setup.md`, `docs/dev/commands.md`, `docs/dev/env.md`, `docs/dev/troubleshooting.md`; `docs/deploy/` amb runbooks (deploy, rollback, backup/restore, rotació de secrets); `docs/reference/api.md` generat.
- Un índex (`docs/README.md`) que digui “si vols X, llegeix Y”.
- `npm run docs:check` (vegeu §7.8) per validar enllaços, comandes i fitxers citats.

**Esforç:** 2–3 dies la reestructuració; el check, mig dia.

---

### 3.3 Millores (S3)

#### F-13 · No hi ha endpoints de salut ni de preparació

`docker-compose.yml` fa servir `curl -f http://localhost:3033/api/adfs` com a healthcheck: barreja “el procés respon” amb “la BD té dades i l'esquema és correcte”. Proposta: `GET /healthz` (procés viu, sense BD) i `GET /readyz` (BD oberta, migracions aplicades, MQTT opcional). Configurar el healthcheck del contenidor contra `/readyz` i deixar `/api/adfs` com a endpoint de negoci.

#### F-14 · Entorn Node divergent

`.nvmrc` fixa `26.13.0`, `engines` exigeix `>=26`, CI i Docker fan servir Node 26, però la màquina local té **Node 24.15.0**. Això pot canviar el comportament de mòduls natius (`better-sqlite3`) i de APIs recents. Proposta: afegir `engine-strict=true` a `.npmrc`, un check a la documentació i, si es vol suportar 24, baixar el mínim explícitament; no deixar tres respostes diferents.

#### F-15 · Dependències mortes i imports pesants

- `front/package.json`: `js-cookie` i `@types/js-cookie` sense cap import a `front/src`; `slug` i `osm2geojson-lite` tampoc no s'importen.
- `back/package.json`: `slug` sense imports.
- `@turf/turf` s'importa com a namespace sencer en 3 fitxers (`Markers.tsx`, `useMaskedArea.ts`, `MapaTab.tsx`), cosa que arrossega molta llibreria al bundle. Proposta: importar els paquets concrets (`@turf/boolean-point-in-polygon`, `@turf/area`, `@turf/helpers`) o mesurar amb `rollup-plugin-visualizer` abans de decidir.
- `uuid` es podria substituir per `crypto.randomUUID()` o `uuidv7` per tenir IDs ordenables.

#### F-16 · `bcryptjs` síncron al camí de login

`back/src/routes/auth.ts` fa `bcrypt.hashSync` i `compareSync` amb cost 10; `routes/users.ts` també fa `hashSync`. És codi JS pur i bloqueja l'event loop 50–150 ms per operació. Amb el throttle actual és assumible en aquesta escala, però sota força bruta és un vector de DoS. Proposta: `bcrypt.hash`/`compare` asíncrons (canvi mínim) o `argon2id` (`@node-rs/argon2`) si s'accepta dependència nativa; mantenir el hash sintètic per igualar temps.

#### F-17 · CSRF i límit de peticions: confiança en Nginx

La cookie és `httpOnly`, `sameSite=lax` i `secure` en producció, i les mutacions són JSON. És una base raonable, però el backend no comprova `Origin`/`Sec-Fetch-Site` i no té `@fastify/rate-limit`; si algú exposés el port 3033 directament, perdria la protecció de Nginx. Proposta: middleware d'origen per a `POST/PUT/DELETE`, `@fastify/helmet` i `@fastify/rate-limit` amb stores en memòria (suficient per a una instància), o documentar explícitament que el backend només és accessible per loopback.

#### F-18 · Autorització repartida entre middleware i handlers

A més de F-03: `/api/adfs/:id/telegram` no té `required` al `wrap` i confia en `canManage()`; `/api/users` fa el mateix. `view_sync_status` no s'usa. Proposta: una sola declaració per ruta (`{ auth, permission, adfScope }`) i un guard comú; els handlers no haurien de repetir la comprovació de rol.

> **Estat (20/11/2026): resolt.** Cap handler comprova rols. La matriu de `back/src/permissions.ts` té ara `manage_users` (admin i coordinador), `manage_all_users` i `manage_adfs` (només admin), i `view_sync_status` protegeix les lectures d'OSM. Cada ruta declara `requireAuth`, `requirePermission`, `requireAdfScope` i, si cal, guards al seu `preHandler`: `requireTargetUserScope()` (usuari objectiu d'`/api/users/:id`), `requireUsernameAdfScope` (ADF del `username`), `requireBodyRolePermission()` (assignar `role: "admin"`) i `requireComputedPermission()` (permís segons l'acció notificada a `/api/sendToTelegram`). `telegram.ts`, `trackingSharing.ts`, `adfBoundaries.ts`, `adfs.ts` i `users.ts` ja no tenen `canManage()` ni `requireAdmin()`; els handlers de `/api/users` i `/api/adfs` són un per mètode i no pas un dispatcher per `req.method`.

#### F-19 · Sense OpenAPI ni client generat

No hi ha `openapi.json` ni client tipat. Proposta: generar-lo a CI amb `@fastify/swagger` i publicar-lo a `docs/reference/openapi.json`; opcionalment generar el client del front amb `orval` o `openapi-typescript` per eliminar la duplicació de F-05.

#### F-20 · Operació i observabilitat

- Pino sense `redact` per a `cookie`, `authorization`, `password`, `token`, `bot_token`.
- Sense `requestId` propagat a la resposta ni al client.
- Backups: `scripts/backup/backup.sh` **atura el contenidor** per fer el checkpoint de WAL; hi ha downtime. Proposta: `litestream` com a sidecar (replicació contínua a S3/R2) i mantenir els scripts per a còpies puntuals; proves de restauració mensuals.
- Sense mètriques ni alertes (llevat de Telegram del propi domini). Proposta mínima: uptime extern + alerta a Telegram; opcional Sentry/GlitchTip per a errors del back i del front.
- Nginx: confirmar `gzip`/`brotli` per a JSON i GeoJSON; no hi són a l'example.

#### F-21 · CI/CD i qualitat de repositori

- No corre `prettier --check` (tot i que `format:check` existeix).
- No fa build de les imatges Docker; un `Dockerfile` trencat no es detecta fins al deploy.
- No hi ha Dependabot/Renovate, ni `audit-ci`, ni commitlint (els missatges actuals són inconsistents: `fix(security); …`).
- `lint-staged` només fa ESLint/Prettier; està bé, però no valida tipus (ho ha de fer CI, no el hook).
- Proposta: feines separades, caché de buildx, Dependabot setmanal agrupat, commitlint sobre el títol del PR (squash), i `prettier --check`.

#### F-22 · Patrons de `.gitignore` que amaguen fitxers

A més de F-01: `/scripts/*` s'ignora amb excepcions; un script nou no versionat és invisible. `mosquitto/config/mosquitto.conf` s'ignora (és generat, correcte). `config/*.nginx` s'ignora i es genera (correcte). Proposta: canviar a allowlist dins `scripts/` o documentar a `CONTRIBUTING.md` que cal afegir l'excepció; i treure `*.md` global.

#### F-23 · Tipus més estrictes

Proposta incremental: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, i tornar a activar `no-unsafe-*`, ara que l'adapter de F-04 ja s'ha eliminat. També `@typescript-eslint/no-explicit-any` a `error`. No cal fer-ho tot de cop: començar pel back i deixar el front per al final.

#### F-24 · Llistats sense paginació

`/api/users`, `/api/incidencies` i els GeoJSON tornen tot el conjunt. Hidrants per ADF està acotat pel territori, però incidències i historial creixen. Proposta: `limit`/`offset` o cursor (`created_at`, `id`) amb un màxim per defecte, i un índex compost adequat.

#### F-25 · Imports relatius profunds i absència d'àlies

`../../map/shared/...`, `../../../contexts/...`. Proposta: àlies `@/` a `tsconfig` i Vite (`resolve.alias`), sense canviar la resta. Redueix el soroll en refactors i ajuda els agents a navegar.

#### F-26 · Duplicació de lògica de conversió i de permisos al front

A més de F-05: el front comprova capacitats amb literals (`(user?.permissions ?? []).includes("sync_osm")`), i `AuthContext` manté una caché global de la matriu. Proposta: exportar `can(user, "sync_osm")` des del paquet de contractes i una constant `PERMISSIONS` per evitar typos.

---

## 4. Arquitectura objectiu

### 4.1 Principis

1. **Monòlit modular, no microserveis.** Una sola instància, SQLite i Docker Compose són adequats per a aquesta escala. La modularitat s'aconsegueix amb carpetes i fronteres, no amb xarxa.
2. **El domini no coneix HTTP.** Serveis i repositoris no han de rebre `req`/`res` ni retornar codis d'estat.
3. **Un sol contracte.** Zod al paquet compartit; el back valida i el front infereix. OpenAPI com a artefacte, no com a font.
4. **La UI només pinta.** El contracte del mapa ja ho compleix; estendre aquest principi a la resta de features.
5. **La feina llarga és un job.** OSM, notificacions massives i càlculs pesants no depenen del cicle d'una petició.
6. **El que no es pot observar no es pot operar.** Salut, logs amb IDs, errors amb codi i backups verificables.

### 4.2 Backend: de “rutes + serveis” a “mòduls verticals”

**Actual**

```text
back/src/
├── server.ts          # bootstrap + adapter + auth + rutes
├── routes/            # 18 fitxers, diversos endpoints per fitxer
├── services/          # 17 fitxers
├── db/
│   ├── schema.ts      # 196 línies, tot el domini
│   └── repositories/
├── utils/
└── scripts/
```

**Objectiu**

```text
back/src/
├── app.ts                 # buildApp(): FastifyInstance (no escolta)
├── server.ts              # config + listen + senyals
├── plugins/
│   ├── auth.ts            # jwt, cookie, sessionUser
│   ├── authorize.ts       # requireAuth, requirePermission, requireAdfScope
│   ├── errors.ts          # AppError → resposta estable
│   └── security.ts        # helmet, rate-limit, origin check
├── modules/
│   ├── auth/              # routes, service, throttle, schemas
│   ├── adfs/              # routes, repository, boundaries
│   ├── hidrants/          # routes, service, repository, schemas
│   ├── incidencies/       # routes, service, repository, schemas
│   ├── osm/               # routes, pull, push, validate, xml, client, conflicts
│   ├── tracking/          # routes, mqtt, positionsRepository, stream
│   ├── telegram/          # routes, webhook, service, repository
│   └── users/             # routes, service, repository, schemas
├── shared/
│   ├── db/                # client + schema/ per domini
│   ├── http/              # errors, responses
│   ├── jobs/              # queue, runner
│   └── lib/               # config, logger, geo, crypto
└── scripts/
```

Regles de frontera:

- Un mòdul pot importar `shared/` i el seu propi domini; **no** pot importar el `service` d'un altre mòdul (si cal, es defineix un cas d'ús a `shared/` o s'exposa una funció de domini).
- Els `routes.ts` només tradueixen HTTP ↔ servei; màxim ~150 línies.
- Els `repository.ts` només fan SQL/Drizzle; màxim ~200 línies, sense regles de negoci.
- Els `schemas.ts` són Zod i es poden compartir amb el front.

Aquesta estructura no és “clean architecture” cerimonial: és **feature slicing** amb tres capes, la mateixa que ja existeix, però agrupada per domini en lloc de per tipus de fitxer.

### 4.3 Frontend: de “components per tipus” a “features”

**Actual**: `components/{hidrants,incidencies,osm,panel,layout,shared,lists,controls}`, `hooks/`, `contexts/`, `utils/`, `map/`.

**Objectiu**

```text
front/src/
├── app/
│   ├── App.tsx
│   ├── providers.tsx      # QueryClient, Auth, Adf, Toasts
│   └── queryClient.ts
├── features/
│   ├── auth/
│   ├── adfs/
│   ├── hidrants/{api.ts, components/, hooks/, types.ts}
│   ├── incidencies/
│   ├── osm/
│   ├── users/
│   ├── telegram/
│   └── tracking/
├── map/                   # es queda tal com és (ja està ben aïllat)
├── shared/
│   ├── api/{client.ts, errors.ts}
│   ├── ui/                # Button, Dialog, Field, EmptyState...
│   ├── hooks/
│   ├── lib/               # format, storage, url, geo comuna
│   └── styles/
└── styles/
```

Migració incremental: primer `hidrants` i `incidencies` (les més grans), després `osm`, `users`, `telegram`. No renombrar `map/`: la seva estructura actual és millor que la proposta genèrica.

### 4.4 Contracte compartit

```text
packages/contracts/
├── package.json           # "name": "@territoriadf/contracts"
├── tsconfig.json
└── src/
    ├── index.ts
    ├── permissions.ts     # ROLES, PERMISSIONS, ROLE_PERMISSIONS, can()
    ├── sync.ts            # SYNC_STATUSES, SyncStatus, transicions
    ├── hydrants.ts        # zod: HydrantUiFields, HydrantFeature, create/update
    ├── incidencies.ts     # zod: Incidencia, events, enums
    ├── adfs.ts            # zod: Adf, bbox, center
    ├── users.ts
    └── osm.ts             # tags permesos, validació compartida
```

- `back` i `front` afegeixen `"@territoriadf/contracts": "*"` i `tsconfig` references.
- Vite consumeix el codi TS del workspace; el back el compila amb `tsc -b`.
- Docker: copiar `packages/contracts` i ajustar els `npm ci -w`.
- Alternativa si es prefereix no tocar workspaces: generar un `contracts.ts` a `docs/reference/` a partir de l'OpenAPI. Però Zod-first és més directe i permet validar al mateix lloc.

### 4.5 Model de dades

Canvis recomanats, per ordre de risc:

1. **Pragmas** (`foreign_keys`, `busy_timeout`, `synchronous`) — vegeu F-02.
2. **JSON tipat** amb `mode: "json"` i `$type` — vegeu F-11.
3. **`positions`** i, si cal, `position_history` — vegeu F-10.
4. **`jobs`** per a OSM i tasques futures — vegeu F-09.
5. **`audit_log`** (`id`, `user_id`, `action`, `entity`, `entity_id`, `data`, `created_at`): qui ha canviat què. És barat i molt valuós per a una eina de gestió compartida entre ADFs.
6. **IDs `uuidv7`** per a noves taules; mantenir `uuidv4` a les existents no és cap problema, però les noves guanyen ordenació per temps.
7. **Índexs compostos**: `hidrants(adf_id, sync_status)`, `incidencies(adf_id, estat, creat_at)`, `incidencia_events(incidencia_id, creat_at)`.
8. **`STRICT` tables** i `CHECK` per a enums, si es vol tancar el cercle; requereix reconstruir taules, fer-ho amb migració i backup.

### 4.6 Feina asíncrona

- `jobs` + worker en procés. No cal Redis ni BullMQ per a una instància.
- Concurrència 1 per ADF i 1 global per a OSM (respectar la política d'OSM).
- Estats: `QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`, amb `progress` i `error` estructurat.
- Idempotència per clau (`adf_id` + hash del conjunt de pendents) i per `osm_version`.
- Notificacions de Telegram **després** del commit de la BD, no dins la transacció.

### 4.7 Errors i permisos

- Un `AppError` amb `code` estable (`HYDRANT_NOT_FOUND`, `ADF_FORBIDDEN`, `OSM_CONFLICT`) a més de `statusCode`; el front tradueix el codi, no el missatge.
- Un guard declaratiu per ruta:
  ```ts
  { auth: true, permission: "delete_hydrant", adf: { from: "query", key: "adf" } }
  ```
- La matriu de permisos viu al paquet de contractes i s'exposa per `/api/config` (ja es fa); el front només consumeix `can()`.

---

## 5. Pla d'acció per fases

Les estimacions són orientatives per a una persona que conegui el codi; no inclouen desplegament ni revisió.

### Fase 0 — Sanejament (2–3 dies)

| Tasca                                                                                 | Troballa | Esforç |
| ------------------------------------------------------------------------------------- | -------- | ------ |
| Treure `*.md` del `.gitignore`, versionar `AGENTS.md`, esborrar o generar `GEMINI.md` | F-01     | 2 h    |
| `PRAGMA foreign_keys = ON`, `foreign_key_check` i neteja d'orfes                      | F-02     | 3 h    |
| `/healthz` i `/readyz`; healthcheck del compose contra `/readyz`                      | F-13     | 3 h    |
| `engine-strict=true` i alinear Node local/CI/Docker                                   | F-14     | 1 h    |
| Treure dependències mortes (`js-cookie`, `slug`, `osm2geojson-lite`)                  | F-15     | 1 h    |
| `npm run docs:check` bàsic (enllaços + comandes)                                      | F-12     | 4 h    |
| Dependabot + `prettier --check` a CI                                                  | F-21     | 2 h    |

**Criteri de sortida:** `npm ci` en un clon net inclou `AGENTS.md`; el healthcheck falla si la BD no és llesta; cap warning de motor.

### Fase 1 — Costures (2 setmanes)

| Tasca                                                                | Troballa | Esforç |
| -------------------------------------------------------------------- | -------- | ------ |
| `buildApp()` + `server.ts` mínim + plugins `auth/errors`             | F-03     | 2 d    |
| Rutes natives pilot: `hidrants` i `incidències` amb Zod              | F-04     | 4 d    |
| `packages/contracts` amb hidrants/incidències/permisos               | F-05     | 3 d    |
| Client API + TanStack Query al pilot                                 | F-06     | 3 d    |
| Tests de backend del pilot (`inject`, BD temporal)                   | F-08     | 3 d    |
| Extreure `useMapSelection`/`useMapCreation` i builders de `MapPanel` | F-07     | 3 d    |

**Criteri de sortida:** el pilot té tests de permisos i ADF; `MapPanel` baixa de 812 a < 450 línies sense canvi visual; `AGENTS.md` apunta a l'estructura nova.

### Fase 2 — Consolidació (4–6 setmanes)

| Tasca                                                                       | Troballa  |
| --------------------------------------------------------------------------- | --------- |
| Migrar la resta de rutes a mòduls i guards declaratius                      | F-03/F-18 |
| Jobs d'OSM amb progrés i idempotència                                       | F-09      |
| Taula `positions` + escriptura amb debounce                                 | F-10      |
| JSON tipat + Zod per `sync_error` i events                                  | F-11      |
| OpenAPI + client generat (o consolidar contracts)                           | F-19      |
| Dividir panells grans (`OsmSyncPanel`, `UsuarisTab`, `TelegramConfigPanel`) | F-07      |
| Reestructurar docs per tasca i eliminar `fitxer:línia`                      | F-12      |
| `audit_log` i índexs compostos                                              | §4.5      |

**Criteri de sortida:** cap fitxer de `back/src` > 300 línies; cap component > 400; OpenAPI publicat; tests de back al CI.

### Fase 3 — Producte (trimestre)

| Tasca                                                              | Valor                                          |
| ------------------------------------------------------------------ | ---------------------------------------------- |
| Decidir el futur de Leaflet amb dades d'ús (telemetria de motor)   | −40% de codi de mapa si es retira              |
| PMTiles per ADF per a offline real                                 | Mapes sense xarxa, no només dades              |
| Outbox de mutacions offline (IndexedDB + Background Sync)          | Editar hidrants al camp sense cobertura        |
| Imatges d'APK/containers immutables a CI (GHCR) + rollback per tag | Desplegaments reproduïbles                     |
| Litestream + prova de restauració mensual                          | RPO de segons, sense aturar el backend         |
| Accessibilitat (Radix, focus trap, teclat) i auditoria             | Ús real en mòbil i camp                        |
| Observabilitat (Sentry/GlitchTip, uptime, alertes)                 | Errors visibles abans que l'usuari els reporti |

---

## 6. Pluja d'idees: llibreries i tècniques

### 6.1 Backend

| Necessitat              | Opció                                                               | Per què                                                 | Cost / nota                            |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------- |
| Validació i OpenAPI     | `fastify-type-provider-zod` + `@fastify/swagger`                    | Un sol esquema per validar, tipar i documentar          | Alt impacte; requereix F-03/F-04       |
| Esquemes des de Drizzle | `drizzle-zod`                                                       | Genera Zod de `insert`/`select`; menys duplicació       | Molt alt impacte, baix cost            |
| Seguretat HTTP          | `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/under-pressure` | Defensa en profunditat si el backend s'exposa           | Baix cost; combinar amb Nginx          |
| Logs de desenvolupament | `pino-pretty` (només dev) + `redact`                                | Llegible en local, sense secrets                        | Molt baix cost                         |
| Contrasenyes            | `bcrypt` asíncron o `@node-rs/argon2`                               | No bloquejar l'event loop; argon2id és l'estat de l'art | Mitjà; provar en Alpine/musl           |
| Feina asíncrona         | `p-queue` + taula `jobs`                                            | Concurrència i represa sense Redis                      | Mitjà; no cal BullMQ a aquesta escala  |
| Tests                   | `vitest` + `fastify.inject` + BD temporal                           | Ràpid, sense xarxa                                      | Crític                                 |
| Errors en producció     | Sentry o GlitchTip (self-host)                                      | Stack traces i contexte                                 | Opcional; vigilar PII                  |
| Mètriques               | `fastify-metrics` (Prometheus) o uptime extern                      | Detectar latència i errors                              | Opcional                               |
| Migracions              | `drizzle-kit generate` + `check` + migració versionada              | Ja funciona; afegir validació i backup previ            | Baix cost                              |
| Backup continu          | Litestream (S3/R2)                                                  | RPO de segons sense aturar el contenidor                | Molt alt impacte; requereix destinació |
| IDs ordenables          | `uuidv7` o `crypto.randomUUID()`                                    | Millor localitat d'índex i paginació                    | Baix cost                              |

### 6.2 Frontend

| Necessitat          | Opció                                                 | Per què                                               | Cost / nota                                              |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Estat de servidor   | `@tanstack/react-query`                               | Caché, deduplicació, reintents, invalidació, offline  | El canvi amb més retorn del front                        |
| Formularis          | `react-hook-form` + `@hookform/resolvers`             | Menys re-renders, validació Zod compartida            | Alt impacte; fer-ho amb el pilot                         |
| Estat UI creuat     | `zustand` (opcional)                                  | Evita prop drilling de capes/visibilitat              | Només si `MapPanel` ho necessita; no per defecte         |
| Accessibilitat      | `@radix-ui/react-dialog`, `dropdown-menu`, `combobox` | Focus trap, teclat, ARIA                              | Mitjà; substitueix diàlegs propis                        |
| Taules i llistes    | `@tanstack/react-table` (opcional)                    | Ordenació, filtres i paginació consistent             | Només si les llistes creixen                             |
| Tests de components | `@testing-library/react` + `msw`                      | Provar comportament, no implementació                 | Alt impacte                                              |
| E2E                 | `@playwright/test` (smoke)                            | Login, canvi d'ADF, mapa amb dos motors               | Cost de manteniment; limitar a 5–8 casos                 |
| Bundle              | `rollup-plugin-visualizer`                            | Veure el pes de Turf/jspdf/MapLibre                   | Baix cost                                                |
| Mapa offline        | `pmtiles` + `@protomaps/basemaps`                     | Paquets per ADF, sense dependre de tessel·les remotes | Alt impacte, mitjà; encaixa amb la PWA                   |
| Icones              | `lucide-react` (opcional)                             | Consistència i mida                                   | Només si es vol substituir `Icons.tsx`; no és prioritari |

### 6.3 Dades i operacions

- **Litestream** per replicació contínua; **`sqlite3 .backup`** per còpies puntuals sense aturar el contenidor (el script actual atura el backend).
- **GHCR + buildx** per imatges immutables; el servidor fa `docker compose pull` i pot tornar a un tag anterior.
- **Dependabot/Renovate** setmanal, agrupat per ecosistema, amb CI com a xarxa.
- **`audit-ci`** o `npm audit --omit=dev` com a informatiu, no bloquejant al principi.
- **Commitlint** amb Conventional Commits; els missatges actuals barregen `;` i àmbits.
- **`docs:check`** a CI: enllaços, comandes, fitxers, mida d'AGENTS i sincronia de còpies.

### 6.4 Idees de producte (opcionals, no formen part de l'auditoria)

- **Outbox offline**: editar hidrants sense cobertura i sincronitzar en tornar; UI de “canvis pendents” i resolució de conflictes amb l'estat d'OSM que ja existeix.
- **PMTiles per ADF**: un fitxer per territori, descarregable, per tenir mapa base sense xarxa (no només dades).
- **PDF al servidor**: eliminar `jspdf` + `html2canvas` (~600 KB) i generar informes amb `pdfkit`/`@react-pdf/renderer` al back, on hi ha les dades i els permisos.
- **Bot de Telegram operatiu**: a més de notificar, permetre `/estat`, `/incidencia` o enviar una foto amb ubicació; el webhook i el vincle per ADF ja existeixen.
- **Pla de revisió d'hidrants**: calcular “hidrants sense revisar fa > 12 mesos” a partir de `synced_at`/`updated_at` i pintar-los al mapa.
- **Historial d'auditoria per ADF**: qui ha canviat què, exportable; molt valuós per a coordinacions.
- **Mapa de calor de pendents OSM**: veure on es concentren els conflictes i planificar una sessió de camp.

### 6.5 Considerades i descartades (per què no)

| Opció                            | Decisió     | Motiu                                                                                                      |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| Microserveis                     | No          | Una instància, un equip, SQLite; la complexitat no compensa.                                               |
| PostgreSQL ara                   | No (encara) | SQLite + WAL aguanta aquesta càrrega; revisar si hi ha multiinstància o escriptures intensives.            |
| Next.js / SSR                    | No          | L'app és una PWA de camp; Vite SPA + service worker és més simple i ja funciona.                           |
| GraphQL                          | No          | Els casos són CRUD + GeoJSON + SSE; REST + OpenAPI cobreix millor.                                         |
| tRPC                             | No (ara)    | Bona DX en monorepo TS, però acobla client i servidor i no resol webhooks/tercers. OpenAPI és més durable. |
| Prisma                           | No          | Drizzle ja funciona i les migracions SQL són transparents.                                                 |
| Redux                            | No          | TanStack Query + reducer/Zustand cobreixen l'estat sense cerimònia.                                        |
| Retirar Leaflet immediatament    | Amb dades   | Cal mesurar ús real; si WebGL2 és > 99%, la retirada estalvia molt de manteniment.                         |
| Biblioteca de components sencera | No          | Tailwind + primitives Radix on calgui; no cal un design system.                                            |

---

## 7. Arxius per a LLMs

Aquesta secció és probablement la més rendible a curt termini, perquè **avui un agent en un clon net no rep cap context**.

### 7.1 Diagnosi

| Problema                                                         | Evidència                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `AGENTS.md` no es versiona                                       | `.gitignore:41` (`*.md`), `git ls-files` no el llista             |
| `GEMINI.md` és una còpia idèntica i no versionada                | `diff AGENTS.md GEMINI.md` buit; tots dos ignorats                |
| L'enllaç de `docs/ARCHITECTURE.md` a `../AGENTS.md` està trencat | En un clon, el fitxer no existeix                                 |
| Les skills d'OpenCode no es comparteixen                         | `.gitignore` ignora `.opencode/` i `opencode.json`                |
| No hi ha `llms.txt`, ADR ni receptes                             | El context s'ha de reconstruir llegint codi                       |
| `AGENTS.md` duplica README/DEV i pesa ~14 KB                     | ~3.000–3.500 tokens; part és informació que ja viu en altres docs |
| No hi ha validació de la documentació                            | Els comptes de tests i les línies ja estan desfasats              |

### 7.2 Principis

1. **Mapa, no manual.** `AGENTS.md` ha de dir _on anar_ i _què no trencar_, no repetir tota la guia.
2. **Divulgació progressiva.** Un índex curt + documents de 100–200 línies per tasca; l'agent només carrega el que necessita.
3. **Font única de veritat.** Un sol fitxer canònic; la resta es genera o s'enllaça.
4. **Verificable per màquina.** Les comandes, rutes i enllaços es poden comprovar; els números no es fixen a mà.
5. **Jerarquia.** `AGENTS.md` a l'arrel + un per paquet; l'agent llegeix el més proper.
6. **Decisions, no només fets.** Els ADR eviten que un agent “millori” el que ja es va decidir conscientment.

### 7.3 Estructura proposada

```text
.
├── AGENTS.md                       # canònic, 150–200 línies, versionat
├── CLAUDE.md                       # symlink → AGENTS.md (o import @AGENTS.md)
├── GEMINI.md                       # generat/symlink; no editar a mà
├── CONTRIBUTING.md                 # humans i agents: flux, estil, commits
├── SECURITY.md                     # com reportar i què no exposar
├── llms.txt                        # índex per a eines que el llegeixen
├── .github/
│   └── copilot-instructions.md     # punter curt a AGENTS.md + docs/llm
├── front/AGENTS.md                 # regles del paquet (mapa, Tailwind, API)
├── back/AGENTS.md                  # capes, permisos, migracions, jobs
├── scripts/AGENTS.md               # idempotència, dry-run, mai secrets
├── .agents/skills/                 # skills versionades (o .opencode/skills desempaperat)
└── docs/
    ├── README.md                   # “si vols X, llegeix Y”
    ├── adr/
    │   ├── 0000-template.md
    │   ├── 0001-sqlite-i-monolit-modular.md
    │   ├── 0002-dos-motors-de-mapa.md
    │   └── 0003-jwt-en-cookie.md
    └── llm/
        ├── index.md                # mapa de context i pressupost de lectura
        ├── glossary.md             # ADF, hidrant, incidència, estat, motiu
        ├── data-model.md           # taules, JSON, relacions, diagrama Mermaid
        ├── invariants.md           # 20 regles que no es poden trencar
        ├── api-map.md              # endpoint → handler → permís → abast ADF
        └── recipes/
            ├── add-endpoint.md
            ├── add-permission.md
            ├── add-map-feature.md
            ├── add-migration.md
            ├── debug-osm-sync.md
            └── deploy.md
```

### 7.4 `AGENTS.md`: contingut i pressupost

**Pressupost:** 150–200 línies, ~1.500–2.000 tokens. Si creix més, és que està duplicant documentació.

**Seccions mínimes**

1. **Què és** (3 línies) i domini en una frase.
2. **Arrencada ràpida** (5 comandes reals, amb els `.env` necessaris).
3. **Invariants** (les 8–10 que no es poden trencar): aïllament dels motors, permisos al back, ADF, estats d'OSM, offline, secrets.
4. **Mapa d'arquitectura** (10 línies, sense arbre exhaustiu).
5. **On canviar què** (taula tasca → fitxers → doc).
6. **Verificació** (comandes exactes; què ha de passar).
7. **Trampes conegudes** (les que han costat sang: zoom −1, identitat MQTT plana, `PENDING_CREATE` s'esborra, cookie secure en logout).
8. **Índex de docs** (`docs/llm/...`).
9. **Data i commit de l'última verificació.**

**El que no hi ha de ser:** la llista completa de 30 scripts, la referència d'API sencera, el detall de desplegament, la història de migracions. Tot això viu enllaçat.

### 7.5 Font única i generació

- `AGENTS.md` és l'únic fitxer editat a mà.
- `CLAUDE.md` pot ser un symlink; si el sistema no suporta symlinks, un fitxer d'una línia amb `@AGENTS.md` (import) o un punter.
- `GEMINI.md` es genera a CI des d'`AGENTS.md` (`cp`) o és un symlink; **no** dues còpies editables.
- `.github/copilot-instructions.md`: 10 línies que apunten a `AGENTS.md` i `docs/llm/`.
- `llms.txt`: índex estàndard amb títol, descripció i enllaços a `docs/llm/*`; opcionalment `llms-full.txt` generat (però millor no, per no inflar el context).

### 7.6 Paquet de context `docs/llm/`

Contingut suggerit, cadascun < 200 línies:

- **`glossary.md`**: ADF, municipi, hidrant, incidència, event, estat de sync, `PENDING_*`, revisió, conflicte, tracking compartit, identitat MQTT plana. Amb exemples reals (`278/GI/011`).
- **`data-model.md`**: taules, camps JSON i la seva forma, relacions, índexs, i un diagrama Mermaid de la màquina d'estats d'OSM.
- **`invariants.md`**: regles verificables. Exemples:
  - Cap import de `leaflet`/`maplibre-gl` fora de `map/engines/**`.
  - Tota mutació d'hidrant/incidència comprova ADF al back, no només a la UI.
  - `POST/PUT/DELETE` amb cookie exigeixen `Origin` propi.
  - Un hidrant `PENDING_CREATE` no es converteix en `PENDING_DELETE`; s'esborra.
  - Les respostes amb dades privades no es cachegen.
  - Els textos d'UI són en català; identificadors en anglès.
- **`api-map.md`**: taula `mètode`, `ruta`, `handler`, `permís`, `abast ADF`, `notes`. Idealment generada de les declaracions de ruta després de F-18.
- **`recipes/`**: passos numerats, fitxers exactes i comanda de verificació. Exemple `add-endpoint.md`:
  1. esquema a `packages/contracts`.
  2. servei al mòdul.
  3. ruta amb `preHandler` i `schema`.
  4. test d'èxit, 401, 403 d'ADF i validació.
  5. entrada a `api-map.md` (o generació).
  6. `npm run typecheck && npm test -w back`.
- **`recipes/add-permission.md`**: `permissions.ts` → guard → `/api/config` → `can()` al front → test de matriu → docs.
- **`recipes/debug-osm-sync.md`**: com reproduir amb Overpass, com llegir `sync_error`, com exportar `.osc`, què no tocar.

### 7.7 Skills

Les skills actuals (`fastify-api`, `leaflet-integration`, `react-frontend`, `sqlite-storage`, `deploy-pm2`) són útils, però:

- `deploy-pm2` no encaixa amb Docker; o s'elimina o es reanomena a `deploy-docker`.
- `leaflet-integration` ha d'incloure la regla d'aïllament i el contracte neutral, no només Leaflet.
- S'han de versionar. Proposta: moure a `.agents/skills/<nom>/SKILL.md` amb frontmatter (`name`, `description`) i enllaços a `docs/llm/`; o desbloquejar `.opencode/skills`.
- Una skill per tasca real, no per tecnologia: `osm-sync`, `map-engine`, `permissions`, `deploy`, `backup-restore`.

### 7.8 Validació automàtica: `npm run docs:check`

Un script petit (Node, sense dependències) que comprovi:

1. Tots els enllaços relatius de `*.md` resolen a un fitxer existent.
2. Tots els `npm run <script>` citats existeixen al `package.json` corresponent.
3. Tots els fitxers citats explícitament a `docs/llm/*` existeixen.
4. `AGENTS.md` < 220 línies.
5. `GEMINI.md`/`CLAUDE.md` estan sincronitzats (hash o symlink).
6. No hi ha referències `\.ts:\d+` a la documentació (o estan en una llista permesa).
7. Els comptes de tests no s'escriuen a mà; si hi són, es comproven executant Vitest amb `--reporter=json` (opcional).

Afegir-lo a CI i a `lint-staged` per als `.md`.

### 7.9 Codificar pensant en LLMs

- **Mida de fitxer:** objectiu < 300 línies al back i < 400 al front; els grans es divideixen per responsabilitat, no per línies.
- **Noms explícits:** `hidrantsRepository`, `osmPushSync`, `requireAdfScope`; evitar `helpers.ts`, `utils.ts` genèrics.
- **Una cosa per fitxer:** un servei, un hook, un component contenidor.
- **Tests al costat:** `foo.test.ts` al mateix directori; l'agent troba el contracte i la prova junts.
- **Sense barrels globals:** els `index.ts` que reexporten tot amaguen dependències; millor imports directes.
- **Tipus a les fronteres:** res de `any` en handlers, respostes o JSON; a dins es pot ser flexible.
- **Comentaris de “per què”:** ja es fa bé; mantenir-ho i evitar comentaris que repeteixin el codi.
- **Errors amb codi:** `OSM_CONFLICT` és més útil per a un agent que “Something went wrong”.
- **Comandes de verificació al README de cada paquet:** `npm run typecheck`, `npm test`, `npm run lint`.

---

## 8. Decisions pendents (ADR)

Aquestes són les decisions que val la pena escriure i no re-obrir cada sis mesos:

1. **ADR-0001 — SQLite + monòlit modular.** Per què no Postgres/microserveis i quin seria el senyal per canviar.
2. **ADR-0002 — Dos motors de mapa.** Cost de manteniment, criteris per retirar Leaflet, dades que cal recollir.
3. **ADR-0003 — Sessió JWT en cookie httpOnly.** Per què no localStorage, `token_version`, durada i logout.
4. **ADR-0004 — Contracte Zod compartit.** Per què no OpenAPI-first (o sí, si es decideix el contrari).
5. **ADR-0005 — Push d'OSM com a job.** Per què no síncron, idempotència i límits.
6. **ADR-0006 — Offline: service worker + outbox.** Què es garanteix i què no.
7. **ADR-0007 — Backup: Litestream vs scripts.** RPO/RTO i proves de restauració.

Cada ADR: context, decisió, conseqüències, alternatives, data. Un fitxer, una pàgina.

---

## 9. Mètriques de salut contínues

Proposar com a “definition of done” del projecte, no com a burocràcia:

| Mètrica                               | Objectiu inicial | Com es mesura          |
| ------------------------------------- | ---------------- | ---------------------- |
| Tests de backend                      | > 40% domini     | Vitest coverage        |
| Tests de `map/core`                   | > 70%            | Vitest coverage        |
| Fitxers > 400 línies                  | 0                | `wc -l` a CI o script  |
| Imports de motors fora de `engines/`  | 0                | ESLint (ja hi és)      |
| Rutes sense permís declarat           | 0                | test dels preHandlers  |
| `any` en handlers                     | 0                | ESLint                 |
| Temps de `typecheck` + `lint` + tests | < 2 min          | CI                     |
| Desplegament amb rollback possible    | sí               | tag d'imatge + runbook |
| Restauració de backup provada         | mensual          | checklist signada      |
| Errors 5xx per 1.000 peticions        | < 5              | logs/mètriques         |
| Latència p95 API lectura              | < 300 ms         | logs/mètriques         |

---

## Annex A — Comprovacions executades

```text
npm run typecheck   → OK (front + back)
npm run lint        → OK (front + back, 0 errors/warnings)
npm test -w front   → 4 fitxers, 16 tests, tots passen
node -v             → v24.15.0
```

No s'ha executat `npm run build` ni s'ha aixecat el servidor per a aquesta auditoria; el CI sí que fa build. No s'ha provat la UI en navegador.

---

## Annex B — Esborrany d'`AGENTS.md` (plantilla, no substitueix l'actual)

> Proposta d'estructura. Cal adaptar-la i **versionar-la**; no s'ha sobreescrit l'`AGENTS.md` existent.

```markdown
# AGENTS.md — TerritoriADF

Aplicació de gestió d'hidrants d'incendis per a ADF (Catalunya).
SPA React + API Fastify + SQLite. Interfície en català; codi en anglès.

## Arrencada ràpida

- `cp back/.env.example back/.env` i `cp front/.env.example front/.env`
- `npm ci`
- `npm run db:setup` (reset + seed + OSM + fronteres)
- `npm run dev` → front http://localhost:3003, API http://localhost:3033
- `npm run docker:up` per a la pila completa

## Invariants (no trencar)

1. Els motors de mapa només s'importen dins `front/src/map/engines/**`.
2. La UI no coneix Leaflet/MapLibre: només el contracte de `map/core/types.ts`.
3. Tota mutació comprova permís i ADF al backend; la UI no és una frontera de seguretat.
4. Els textos d'UI són en català; identificadors i rutes, en anglès.
5. No es desen secrets al client ni a `localStorage` (sessió = cookie httpOnly).
6. Els estats d'OSM són una màquina d'estats: no inventar transicions.
7. `PENDING_CREATE` s'esborra en descartar; mai es converteix en `PENDING_DELETE`.
8. Les respostes amb dades privades no es cachegen.
9. Un canvi de mapa s'implementa als dos adaptadors o es degrada amb `EngineCapabilities`.
10. Abans de tancar: `npm run typecheck && npm run lint && npm test -w front`.

## Mapa

- `front/src/map/` — contracte neutral, adaptadors, capes, UI del mapa.
- `front/src/components/` — UI per domini; els panells grans tenen hooks propis.
- `back/src/routes/` — HTTP; `services/` — domini; `db/` — Drizzle.
- `back/src/permissions.ts` — matriu rol → capacitat (font única).
- `docs/` — DEV, DEPLOY, OSM_SYNC, PWA, ARCHITECTURE, llm/.

## On canviar què

| Vull…                   | Fitxers principals                                     | Doc                      |
| ----------------------- | ------------------------------------------------------ | ------------------------ |
| Afegir un endpoint      | `back/src/routes/`, `services/`, `docs/llm/api-map.md` | `recipes/add-endpoint`   |
| Canviar permisos        | `back/src/permissions.ts`, guard, `/api/config`, front | `recipes/add-permission` |
| Afegir una capa de mapa | `front/src/map/shared/`, `engines/*`, `LayersPanel`    | `ARCHITECTURE.md`        |
| Tocar la sync OSM       | `back/src/services/osm*.ts`, `routes/osm.ts`           | `OSM_SYNC.md`            |
| Migrar la BD            | `back/src/db/schema.ts`, `drizzle/`, `db:migrate`      | `recipes/add-migration`  |
| Desplegar               | `scripts/deploy/update.sh`, `docker-compose.yml`       | `DEPLOY.md`              |

## Trampes conegudes

- El zoom neutral és el de Leaflet; MapLibre resta 1 i suma 1.
- La identitat MQTT aplana `/` → `_` (`278/GI/011` → `278_GI_011`).
- Els WMS d'IGN amb `{-y}` necessiten `scheme: "tms"`.
- En logout, la cookie s'ha d'esborrar amb els mateixos atributs (`secure`, `sameSite`).
- `back/data` és un volum; no hi posis fitxers de codi.

## Verificació

- `npm run typecheck`
- `npm run lint`
- `npm test -w front`
- `npm run build`
- Backend (quan n'hi hagi): `npm test -w back`

## Context ampliat

- `docs/llm/index.md` — què llegir segons la tasca.
- `docs/llm/invariants.md`, `data-model.md`, `api-map.md`.
- `docs/adr/` — decisions i alternatives descartades.
```
