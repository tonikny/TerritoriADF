# Arquitectura i estructura de fitxers

Aquest document descriu l'organització actual del codi, el contracte dels motors de mapa i les comprovacions automàtiques. Per al dia a dia de desenvolupament, consulta [`DEV.md`](DEV.md); les regles de contribució per a persones i agents viuen a `AGENTS.md`, una guia interna que no es versiona en aquest repositori.

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
│   │   ├── components/
│   │   │   ├── layout/             # MapPanel, Panel, BottomSheet, TabBar
│   │   │   ├── controls/           # logo, escala, zoom, GPS, pantalla completa
│   │   │   ├── hidrants/
│   │   │   ├── incidencies/
│   │   │   ├── panel/              # pestanyes ADF, seguiment, informes...
│   │   │   └── shared/
│   │   ├── contexts/               # AuthContext, AdfContext, AppConfigContext
│   │   ├── features/               # consultes i mutacions per domini (users, telegram, hidrants, osm, adfs, tracking)
│   │   ├── hooks/                  # dades, geolocalització, polling i comportament del mapa (map/)
│   │   ├── styles/                 # Tailwind i estils compartits
│   │   └── utils/
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

| Fitxer                                       | Què cobreix                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `front/src/map/core/zoom.test.ts`            | Conversió del zoom neutral a MapLibre, reversibilitat i casos de diversos nivells.                                                     |
| `front/src/map/core/geometry.test.ts`        | `bboxToBounds`, distància entre coordenades, retallada a un radi màxim i vista per defecte d'una ADF.                                  |
| `front/src/map/core/engineSelection.test.ts` | MapLibre per defecte amb WebGL2, fallback sense WebGL2, overrides explícits i prioritat de `?engine=` sobre el fallback de sessió.     |
| `front/src/map/core/builders.test.ts`        | Marcadors d'hidrant/incidència/tracking, arrossegament retallat al radi, màscara o frontera segons capa tècnica i línies de ruta.      |
| `front/src/shared/api/client.test.ts`        | Client d'API: query serialitzada, cos JSON amb credencials, `ApiError` amb estat i codi, resposta 204 i propagació de l'`AbortSignal`. |
| `front/src/hooks/useIncidencies.test.tsx`    | Cursa en canviar d'ADF: la resposta de l'ADF anterior no trepitja la de l'ADF activa.                                                  |
| `front/src/utils/hidrantDisplay.test.ts`     | Imatges d'hidrant: UUID de Panoramax i llista d'hosts permesos, amb rebuig de path traversal i `javascript:`.                          |

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
5. `npm run db:migrate -w back`
6. `npm run db:check -w back`
7. `npm run test:coverage -w back`
8. `npm run test:coverage -w front`
9. `npm run build`

El pipeline no publica artefactes ni desplega.

## 5. Convencions de manteniment

- Mantén el contracte neutral: la UI no ha de conèixer API de tercers del mapa.
- Dins de `front/src`, els imports creuats es fan amb l'àlies `@/...` (`tsconfig.json` i `vite.config.ts`); ESLint prohibeix els imports amb `../`. Les fronteres entre `components`, `hooks`, `contexts`, `shared`, `map` i `utils` també estan imposades a `front/eslint.config.mjs`.
- Si una funcionalitat no es pot implementar a Leaflet, amaga-la o degrada-la amb `EngineCapabilities`; no deixis controls morts.
- Els textos d'interfície i la documentació són en català; els identificadors de codi, en anglès.
- Abans de tancar un canvi: `typecheck`, `lint`, tests del front i build han de passar.
- Els canvis de desplegament o de variables d'entorn van a [`DEV.md`](DEV.md); la documentació interna de producció (`local-doc/ops/deploy.md`, `local-doc/ops/migration.md`) viu al repositori privat de documentació, no aquí.
