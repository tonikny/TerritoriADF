# Arquitectura i estructura de fitxers

Aquest document descriu l'organització actual del codi, el contracte dels motors de mapa i les comprovacions automàtiques. Per al dia a dia de desenvolupament, consulta [`DEV.md`](DEV.md); les regles de contribució per a persones i agents viuen a `AGENTS.md`, un enllaç a la documentació privada del projecte (`local-doc/`), on també hi ha les auditories i els plans datats.

## 1. Visió general

TerritoriADF és una SPA amb dos workspaces:

- **`front/`**: React 19 + TypeScript + Vite + Tailwind CSS 4. El mapa té dos adaptadors intercanviables: **MapLibre GL JS 6** (per defecte) i **Leaflet 1.9 + React Leaflet 5** (fallback).
- **`back/`**: Fastify 5 + TypeScript + Drizzle ORM + SQLite. Gestiona autenticació, hidrants, incidències, OSM, Telegram, tracking MQTT i backups.
- **`docs/`**: guies d'ús, desplegament, OSM, MQTT, PWA i aquesta referència d'arquitectura.

## 2. Estructura del repositori

```text
territoriadf/
├── front/
│   ├── public/                     # imatges, icones i GeoJSON públics
│   ├── src/
│   │   ├── map/                    # capa de mapa intercanviable
│   │   │   ├── MapSurface.tsx      # Suspense + error boundary
│   │   │   ├── core/               # contracte i lògica neutral
│   │   │   │   ├── types.ts        # MapEngineProps, specs, MapFocus
│   │   │   │   ├── capabilities.ts # què pot fer cada motor
│   │   │   │   ├── builders.ts     # specs de marcadors, polígons i línies (pur)
│   │   │   │   ├── engineSelection.ts
│   │   │   │   ├── geometry.ts
│   │   │   │   └── zoom.ts
│   │   │   ├── engines/
│   │   │   │   ├── leaflet/        # adaptador Leaflet
│   │   │   │   └── maplibre/       # adaptador MapLibre
│   │   │   ├── shared/             # capes, estils, icones, rutes, vista
│   │   │   └── ui/                 # LayersPanel, MapAttribution i MapErrorBoundary
│   │   ├── components/             # només el shell: no carreguen dades
│   │   │   ├── layout/             # MapPanel, Panel, BottomSheet, TabBar
│   │   │   ├── lists/              # llistes i exportació a PDF
│   │   │   ├── panel/              # PanelTabs i tabs/
│   │   │   └── shared/             # UI compartida (accessos, avisos, selector)
│   │   ├── contexts/               # AuthContext, AdfContext, AppConfigContext
│   │   ├── features/               # una carpeta per domini: adfs, hidrants, incidencies,
│   │   │                           # map-view, osm, telegram, tracking i users, amb
│   │   │                           # api.ts, consultes, mutations i components
│   │   ├── hooks/                  # geolocalització, polling i comportament del mapa
│   │   ├── shared/                 # api/ (client i crides transversals), query/, ui/
│   │   ├── styles/                 # Tailwind i estils compartits
│   │   └── utils/                  # funcions pures (geo, temps, PDF, offline...)
│   ├── index.html
│   └── vite.config.ts
├── packages/
│   └── contracts/                  # contractes compartits back/front (Zod): permisos, incidències, estats OSM i conversions
│       └── src/
├── back/
│   ├── src/
│   │   ├── app.ts                  # buildApp(): plugins, guards i rutes (no escolta cap port)
│   │   ├── server.ts               # bootstrap: listen, MQTT i aturada ordenada
│   │   ├── plugins/                # auth (sessió), authorize (guards), errors, openapi
│   │   ├── routes/                 # endpoints; cada mòdul registra les seves rutes amb Zod + preHandler
│   │   ├── services/               # OSM, Telegram, MQTT, hidrants...
│   │   ├── db/                     # esquema Drizzle, repositoris i connexió
│   │   ├── scripts/                # seed, importació, migracions, utilitats
│   │   ├── utils/
│   │   └── permissions.ts          # re-exporta la matriu de permisos del paquet de contractes
│   └── data/                       # SQLite local (no versionada)
├── docs/
├── scripts/                        # desplegament, backups, Nginx, MQTT
├── .github/workflows/ci.yml
├── docker-compose.yml
└── package.json                    # workspaces packages/contracts + front + back
```

L'accés a dades dels serveis i les rutes passa sempre pels repositoris de `back/src/db/repositories/` (un per entitat: ADFs, hidrants, incidències, usuaris, identitats MQTT, tokens d'accés i Telegram); cap ruta ni servei no importa `db` ni l'esquema. Els scripts de `back/src/scripts/` en són l'excepció deliberada.

Els tests del front viuen al costat del codi que proven (`*.test.ts` / `*.test.tsx`), no en una carpeta `tests/` separada.

### 2.1 Model de dades: tags d'hidrant

La taula `hidrants` (`back/src/db/schema.ts`) separa tres tipus de dades:

- `osm_tags`: el que es publica a OSM. El pull i el push el mantenen sincronitzat i és l'única font de la posició publicada.
- `service_tags`: informació de servei que **no** va a OSM (observacions, accés, claus). És compartida: qualsevol sessió iniciada, de qualsevol ADF, la llegeix quan consulta els hidrants d'una ADF; les respostes anònimes no la inclouen. Decisió i motius: ADR 0005, `local-doc/decisions/0005-tags-de-servei-dels-hidrants.md`.
- `private_tags`: **reservat** per a dades que només ha de veure l'ADF propietària. L'API no l'escriu i no en retorna contingut: la columna es manté a `'{}'`. Fer-la servir requereix un ADR que reemplaci el 0005.

`sync_status` és `NOT NULL DEFAULT 'SYNCED'`: les consultes amb `NOT IN` i `!=` descarten les files `NULL` en silenci, i un hidrant sense estat desapareixeria del mapa, del panell OSM i del push alhora.

## 3. Motors de mapa

### 3.1 Selecció del motor

`front/src/map/core/engineSelection.ts` decideix el motor amb aquest ordre:

1. `?engine=leaflet` o `?engine=maplibre` a la URL.
2. Fallback de la sessió, activat si MapLibre ha tingut un error fatal.
3. Preferència desada a `localStorage` (`Configuració → Motor de mapa`).
4. Detecció de WebGL2.
5. Leaflet si no hi ha WebGL2.

`?engine=maplibre` també guanya un fallback de sessió anterior, però **no** pot saltar-se la manca de WebGL2: en aquest cas el motor continua sent Leaflet. La selecció feta a Configuració neteja el fallback i es desa per a les properes visites.

### 3.2 Contracte neutral

`front/src/map/core/types.ts` defineix `MapEngineProps` i les especificacions que rep qualsevol motor:

- vista inicial (`ViewState`) i focus (`MapFocus`);
- ràsters base i superposicions (`MapRasterSpec`, incloent-hi WMS);
- polígons, línies i marcadors;
- callbacks de clic, context menu, long press i canvi de vista;
- senyal d'error fatal per fer el fallback.

`MapPanel` és el propietari de l'estat (ADF, capes, selecció, vista i dades). Els adaptadors no guarden estat de negoci: només pinten les especificacions i retornen esdeveniments. No es fan servir `CustomEvents` ni `querySelector` per comunicar-se amb el mapa.

`engines/registry.ts` registra cada adaptador amb `lazy()`; `MapSurface` l'embolcalla amb `MapErrorBoundary` i mostra un estat de càrrega mentrestant.

### 3.3 Adaptadors

| Carpeta             | Motor                                       | Capacitats                      |
| ------------------- | ------------------------------------------- | ------------------------------- |
| `engines/maplibre/` | MapLibre GL JS 6 + `@vis.gl/react-maplibre` | WebGL2, pitch i terreny 3D      |
| `engines/leaflet/`  | Leaflet 1.9 + React Leaflet 5               | Mapa 2D; sense pitch ni terreny |

Els dos adaptadors implementen les mateixes peces: `Rasters`, `Shapes`, `Markers` i `MapEngine`; la gestió d'esdeveniments viu dins de `MapEngine` (a Leaflet, a més, a `Events.ts`). Cada motor té els seus ajustos CSS a `leaflet.css` o `maplibre.css`, dins de la seva carpeta; `styles/index.css` només conté estils comuns. La UI no importa mai `leaflet`, `react-leaflet`, `maplibre-gl` ni `@vis.gl/react-maplibre`; ho impedeix `no-restricted-imports` a `front/eslint.config.mjs`.

### 3.4 Zoom, ràsters i capes

- La convenció pública del zoom és la de Leaflet (`món = 256·2^z`). L'adaptador MapLibre resta 1 al zoom neutral abans de passar-lo al motor i hi suma 1 en reportar-ne canvis (`core/zoom.ts`).
- Els ràsters usen `tileSize: 256`. Els serveis IGN amb `{-y}` es declaren amb `scheme: "tms"`.
- Els mapes base i les superposicions són compartits a `map/shared/basemaps.ts` i `map/shared/overlays.ts`.
- Els WMS es construeixen amb `bbox={bbox-epsg-3857}` a MapLibre i amb `WMSTileLayer` a Leaflet.

### 3.5 3D, atribució i controls

- El terreny i el hillshade només existeixen a MapLibre (`capabilities.terrain`). Fan servir les tessel·les Terrain-RGB de 5 m de l'ICGC (encoding Mapbox, 512 px, minzoom 6, maxzoom 14; només cobreixen Catalunya) a través de `/tiles/icgc-terrain/`, que el Nginx del host cacheja a `tiles_cache`. El toggle s'amaga a Leaflet. El control «x2» duplica l'exageració del terreny (1,3 → 2,6) i es desa a `localStorage`.
- Sense 3D, MapLibre fixa `maxPitch = 0` i el pitch es reinicia; el drag horitzontal continua permetent la rotació.
- El mode 3D pinta cel i fosca amb el `sky` de MapLibre (`MapEngine.tsx`), amb l'horitzó del mateix color que el fons del mapa perquè la transició no es noti. En 2D no és visible perquè el pitch és 0.
- L'atribució de MapLibre es pinta en un overlay propi (`ui/MapAttribution`): mostra OSM o IGN, les superposicions i el terreny en una sola línia si hi caben, i les separa en línies abans de topar amb el zoom. Amb terreny, la segona línia és `© ICGC, MDT 5 m (CC BY 4.0)`.
- Les capes vectorials de l'ADF es reordenen per sobre dels ràsters i del hillshade després de cada canvi de mapa base o de relleu; així el mask exterior no queda tapat.
- `MapUIOverlays` agrupa capes, GPS i pantalla completa en una columna dreta alineada amb la part superior del logo. El panell de capes és desplegable, es tanca amb `Escape` o amb un clic fora i només mostra «Relleu 3D» si el motor el suporta.
- `MapScale` calcula una distància rodona (1, 2 o 5 × 10ⁿ) a partir del centre i el zoom i la mostra just a sobre del zoom; funciona igual amb els dos motors.
- A mòbil, el zoom i l'atribució queden a una alçada fixa sobre la barra del bottomsheet (60 px). Quan el panell s'obre, no es desplacen: queden a sota i el bottomsheet els tapa.

### 3.6 Afegir una funcionalitat de mapa

1. Defineix la dada al contracte de `core/types.ts`.
2. Implementa-la als dos adaptadors o degrada-la explícitament amb `EngineCapabilities`.
3. Reutilitza les especificacions i els estils de `map/shared/` abans de duplicar lògica.
4. Afegeix un test a `core/` si la lògica és pura (geometria, zoom, selecció de motor).
5. Comprova el resultat amb els dos motors: `?engine=maplibre` i `?engine=leaflet`.

## 4. Tests i comprovacions

### 4.1 Tests inclosos

Els tests viuen al costat del codi que proven i es descobreixen sols: `npm test -w front` en diu quants n'hi ha i quins passen. Aquí no se'n fixa el nombre, que canvia amb cada funcionalitat.

| Fitxer                                                   | Què cobreix                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `front/src/map/core/zoom.test.ts`                        | Conversió del zoom neutral a MapLibre, reversibilitat i casos de diversos nivells.                                                     |
| `front/src/map/core/geometry.test.ts`                    | `bboxToBounds`, distància entre coordenades, retallada a un radi màxim i vista per defecte d'una ADF.                                  |
| `front/src/map/core/engineSelection.test.ts`             | MapLibre per defecte amb WebGL2, fallback sense WebGL2, overrides explícits i prioritat de `?engine=` sobre el fallback de sessió.     |
| `front/src/map/core/builders.test.ts`                    | Marcadors d'hidrant/incidència/tracking, arrossegament retallat al radi, màscara o frontera segons capa tècnica i línies de ruta.      |
| `front/src/shared/api/client.test.ts`                    | Client d'API: query serialitzada, cos JSON amb credencials, `ApiError` amb estat i codi, resposta 204 i propagació de l'`AbortSignal`. |
| `front/src/features/incidencies/useIncidencies.test.tsx` | Cursa en canviar d'ADF: la resposta de l'ADF anterior no trepitja la de l'ADF activa.                                                  |
| `front/src/features/hidrants/hidrantDisplay.test.ts`     | Imatges d'hidrant: UUID de Panoramax i llista d'hosts permesos, amb rebuig de path traversal i `javascript:`.                          |
| `front/src/features/osm/OsmSyncPanel.test.tsx`           | Selecció múltiple de pendents entre seccions, accions per lots i confirmació de descartar.                                             |
| `front/src/features/users/UsuarisTab.test.tsx`           | Portes de rol: admin, coordinador (només la seva ADF) i voluntari sense gestió d'usuaris.                                              |

La cobertura del front (`npm run test:coverage -w front`) es mesura sobre `src/**` gràcies a `coverage.include` a `front/vitest.config.ts`: sense això, el percentatge només comptava els mòduls que algun test havia carregat. El llindar és un ratchet baix (el punt de partida honest, no l'objectiu) i pot pujar-se, però no baixar sense justificar-ho.

El backend té la seva pròpia suite (`npm test -w back`, detalls a [`TESTING.md`](TESTING.md)). Les comprovacions de Telegram que no necessiten xarxa es fan amb `npm run telegram:selftest -w back`.

### 4.2 Comandes

```bash
npm test -w front          # Vitest, tots els tests del front
npm run test:coverage -w front  # els mateixos tests amb cobertura (el que corre al CI)
npm run typecheck          # contracts + front + back
npm run lint               # front + back
npm run build              # build de front + back
```

Per executar només un fitxer:

```bash
npm test -w front -- src/map/core/engineSelection.test.ts
```

### 4.3 CI

`.github/workflows/ci.yml` s'executa en `push` a `main`/`develop` i en qualsevol `pull_request` amb Node 26:

1. `npm ci`
2. `npm run typecheck`
3. `npm test -w packages/contracts`
4. `npm run lint`
5. `npm run docs:check`
6. `npm run db:migrate -w back`
7. `npm run db:check -w back`
8. `npm run test:coverage -w back`
9. `npm run test:coverage -w front`
10. `npm run build`

`docs:check` (`scripts/docs-check.mjs`) comprova que els enllaços relatius, les imatges i els camins de fitxer citats a `README.md` i `docs/**` existeixen, i que cada `npm run` citat és un script real. Els camins de `local-doc/` queden fora: és un altre repositori, privat, que no viatja amb el codi. També queden fora els camins generats, llistats a `GENERATED_PATHS` al mateix script: la documentació cita a propòsit artefactes que es creen en local (`front/dist/sw.js`, `mosquitto/config/mosquitto.conf`) i que no existeixen en un clon net com el del CI. La llista és tancada: un camí nou que no existeixi segueix sent un error.

El pipeline no publica artefactes ni desplega.

## 5. Convencions de manteniment

- Mantén el contracte neutral: la UI no ha de conèixer API de tercers del mapa.
- Dins de `front/src`, els imports creuats es fan amb l'àlies `@/...` (`tsconfig.json` i `vite.config.ts`); ESLint prohibeix els imports amb `../`. Les fronteres entre `components`, `hooks`, `contexts`, `shared`, `map` i `utils` també estan imposades a `front/eslint.config.mjs`.
- Les crides a l'API d'un domini viuen a `features/<domini>/api.ts`. `shared/api/` queda per al que travessa dominis: el client, la identitat (`auth.ts`), les notificacions (hidrants i OSM) i les lectures del catàleg d'ADFs que fa `AdfContext`, perquè `contexts/` no pot dependre de features.
- Si una funcionalitat no es pot implementar a Leaflet, amaga-la o degrada-la amb `EngineCapabilities`; no deixis controls morts.
- Els textos d'interfície i la documentació són en català; els identificadors de codi, en anglès.
- Abans de tancar un canvi: `typecheck`, `lint`, tests del front i build han de passar.
- Els canvis de desplegament o de variables d'entorn van a [`DEV.md`](DEV.md); la documentació interna de producció (`local-doc/ops/deploy.md`, `local-doc/ops/migration.md`) viu al repositori privat de documentació, no aquí.
