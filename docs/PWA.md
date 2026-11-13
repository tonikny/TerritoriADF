# PWA a TerritoriADF

Documentació de la capa PWA (Progressive Web App) del frontend: què s'ha implementat,
com es prova, com es desplega i quins límits té.

> Estat: **fases 1 i 2 completades** — aplicació instal·lable a Chromium, app shell offline,
> caché de tiles del mapa i lectura de les dades de l'ADF sense connexió. L'escriptura
> offline no està prevista; vegeu
> [Possibilitat futura](#possibilitat-futura-escriptura-offline).

## Què fa la fase 1

- **Manifest** generat per `vite-plugin-pwa` a `dist/manifest.webmanifest`, amb nom,
  icones de 192 i 512 px (reutilitza les de `front/public/`), `display: standalone`,
  `theme_color` `#007bff` i `lang: ca`.
- **Service worker** (Workbox) generat a `dist/sw.js`, que precacheja l'app shell
  (JS, CSS, HTML, icones i fonts) i aplica `CacheFirst` a les tiles de mapa.
- **Meta tags** a `front/index.html`: `manifest`, `theme-color` i les meta
  `apple-mobile-web-app-*`.
- **Prompt d'instal·lació** (un toast blanc amb botons _Instal·la_ / _Ara no_, sense
  tancament automàtic) i **avís d'actualització** a
  `front/src/components/shared/PwaBanner.tsx`, muntat des de `App.tsx`.
- **Capçaleres de caché** a `front/nginx.conf`: `no-cache` per `sw.js`, manifest i
  `workbox-*.js`; `immutable` per `/assets/`.

Les dades de l'API es cachegen només per a lectura offline (fase 2). Com que són
autenticades per cookie, les cachés d'API s'esborren en tancar sessió i `/api/auth/me`
no s'hi desa mai, perquè un dispositiu compartit no ha de veure respostes d'un altre usuari.

## Peces i per què

| Fitxer                                      | Funció                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `front/vite.config.ts`                      | Bloc `VitePWA`: manifest, `globPatterns`, `globIgnores`, `navigateFallback`, `runtimeCaching` de tiles |
| `front/index.html`                          | `link rel="manifest"`, `theme-color`, meta d'Apple                                                     |
| `front/src/vite-env.d.ts`                   | Tipus del mòdul virtual `virtual:pwa-register/react`                                                   |
| `front/src/components/shared/PwaBanner.tsx` | `beforeinstallprompt`, `appinstalled`, toast d'instal·lació i recàrrega per actualització              |
| `front/nginx.conf`                          | Caché correcta de `sw.js`, manifest i assets versionats                                                |

### Decisions rellevants

- `registerType: 'autoUpdate'`: el service worker nou fa `skipWaiting` i pren el
  control sense intervenció de l'usuari. Per evitar que convisquin `index.html` nou i
  chunks antics (pantalla en blanc), `PwaBanner` recarrega la pàgina en rebre
  `controllerchange` i, en tornar, mostra un toast "Aplicació actualitzada
  correctament".
- `injectRegister: null`: el registre el fa `useRegisterSW` des de React, no un script
  injectat al HTML.
- `navigateFallbackDenylist` amb `/api/` i `/tiles/`: les navegacions a aquests camins
  no han de rebre `index.html`.
- `globIgnores` deixa fora `public/images`, `public/municipis` i `public/geojson`: no són
  app shell i inflarien la descàrrega inicial.
- Tiles: `CacheFirst`, 3000 entrades i 30 dies. Un topall és imprescindible perquè
  `CacheStorage` no és il·limitat i el navegador pot evictar-lo.

## Comportament per navegador

|                       | Chrome / Edge Android | Chrome / Edge escriptori        | Firefox Android                 | Firefox escriptori                       | Safari iOS                                |
| --------------------- | --------------------- | ------------------------------- | ------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Instal·lació          | WebAPK (icona real)   | Finestra pròpia + accés directe | Drecera amb badge del navegador | No (cal extensió)                        | Compartir → Afegeix a la pantalla d'inici |
| Mode `standalone`     | Sí                    | Sí                              | No                              | Només web apps de Windows (Firefox 143+) | Sí                                        |
| `beforeinstallprompt` | Sí                    | Sí                              | No                              | No                                       | No                                        |
| Offline (SW)          | Sí                    | Sí                              | Sí                              | Sí                                       | Sí                                        |

Conseqüències pràctiques:

- El prompt d'instal·lació només apareix a Chromium. A Firefox i Safari, `PwaBanner` no
  mostra res: cal explicar-ho a l'usuari (menú → _Instal·la_ a Firefox Android;
  _Compartir_ → _Afegeix a la pantalla d'inici_ a iOS).
- A Firefox Android la icona obre el lloc **dins del navegador**, no en finestra pròpia.
- A Chrome, `beforeinstallprompt` requereix HTTPS, manifest vàlid i un mínim d'implicació
  (una visita d'uns 30 s). Si l'usuari instal·la des del menú, funciona igualment.

## Desenvolupament i proves

El service worker **no** s'ha d'activar en `npm run dev`: és fàcil acabar servint codi vell.

```bash
# 1. Build de producció del frontend
npm run build -w front

# 2. Servidor local (http://localhost:4173 és context segur)
npm run preview -w front
```

Comprovacions a les DevTools (Chrome):

1. **Application → Manifest**: nom, icones, `start_url`, `display` i cap error.
2. **Application → Service Workers**: `sw.js` actiu i sense errors.
3. **Application → Cache Storage**: `workbox-precache-*` després de carregar, i
   `map-tiles` després de navegar pel mapa.
4. **Network → Offline** i recarregar: l'app ha d'arrencar; el mapa mostra les tiles
   ja visitades.
5. **Application → Manifest → Installability**: ha de sortir com a instal·lable.

Lighthouse ja no té la categoria PWA: no serveix com a verificació.

### Provar en un mòbil de la xarxa local

`vite-plugin-mkcert` genera un certificat que el mòbil no es refia, així que el service
worker no es registrarà per IP. Opcions:

- provar amb `npm run preview` des del mateix equip, o
- servir el build amb un certificat de confiança (per exemple el del domini real), o
- acceptar el certificat al mòbil abans de provar (el context segur ho requereix).

## Desplegament

El build de Docker no canvia: `front/Dockerfile` compila amb Vite i serveix `dist/` amb
Nginx. Els fitxers nous (`sw.js`, `workbox-*.js`, `manifest.webmanifest`) es generen al
build.

`front/nginx.conf` ja porta les capçaleres necessàries. Si el Nginx del **host** també
afegeix capçaleres, recordeu que `add_header` dins d'un `location` substitueix tot el joc
heretat del `server`: repetiu-hi les de seguretat que ja tingueu.

Després de desplegar:

1. Obrir el lloc i comprovar que apareix l'avís de nova versió (si ja hi havia SW actiu).
2. Verificar que `GET /manifest.webmanifest` retorna `200` amb
   `Content-Type: application/manifest+json` i `Cache-Control: no-cache`.
3. Verificar que `GET /sw.js` retorna `200` amb `Cache-Control: no-cache`.

## Actualitzacions

Tot és automàtic, sense preguntes:

1. El navegador detecta un `sw.js` nou (en navegar o quan el SW anterior fa la seva
   comprovació periòdica).
2. El SW nou s'instal·la i fa `skipWaiting`; en activar-se dispara `controllerchange`.
3. `PwaBanner` recarrega la pàgina perquè el codi servit i el que corre coincideixin.
4. En tornar, mostra el toast estàndard (mateix estil que la resta d'avisos de l'app):
   **"Aplicació actualitzada correctament"**.

Detalls de la implementació a `PwaBanner.tsx`:

- El senyal de "hi ha actualització" es desa a `sessionStorage` quan el worker passa a
  `installed` i ja hi havia un SW controlant la pàgina; així el toast sobreviu a la
  recàrrega i no apareix mai en la primera instal·lació.
- `controllerchange` també es dispara en la primera instal·lació, per això només es
  recarrega si la pàgina ja tenia controlador en muntar-se.
- `cleanupOutdatedCaches` elimina els precaches antics.
- El `<link rel="manifest">` l'injecta el plugin al build (no cal duplicar-lo a
  `index.html`), i el manifest també entra al precache perquè es versioni amb el SW.
- Les icones del manifest s'afegeixen soles al precache; no les posem a `globPatterns`
  per no duplicar entrades.

## Límits: què no pot fer una PWA aquí

- **Tracking en segon pla**: el navegador atura el JS i la geolocalització quan l'app no
  és en primer pla. OwnTracks + MQTT continua sent l'única via per al tracking continu.
- **Escriptures offline**: no hi ha cua automàtica. La Background Sync API no existeix a
  Firefox, així que caldria una cua pròpia a IndexedDB amb reintent i gestió de conflictes.
- **Emmagatzematge evictable**: qualsevol navegador pot esborrar `CacheStorage` o
  IndexedDB si falta espai. No hi guardeu mai l'única còpia de res.
- **Push**: suportat a Chromium i a iOS 16.4+ (amb l'app a la pantalla d'inici), amb
  lliurament no garantit. No serveix per a alertes crítiques.
- **Privadesa**: les respostes de `/api` es cachegen per a lectura offline, així que
  s'esborren en tancar sessió i en rebre un `401`; `/api/auth/me` no es cacheja mai.

## Fase 2: lectura offline de dades

- **Caché d'API** (`runtimeCaching` de `front/vite.config.ts`): `NetworkFirst` amb
  `networkTimeoutSeconds: 3` per a `GET /api/adfs`, `/api/hidrants`, `/api/incidencies` i
  `/api/adf/boundary`, a la caché `api-data` (60 entrades, 7 dies). Només `GET` i només
  respostes `200`: les escriptures no s'emmagatzemen mai.
- **Antiguitat** (`utils/offlineData.ts` i `components/shared/OfflineNotice.tsx`): cada
  lectura feta amb xarxa desa el moment a `localStorage`
  (`territoriadf-last-sync:<adf>`). Sense connexió, el mapa mostra
  «Sense connexió · dades de fa X», perquè una còpia no es confongui amb l'estat real.
- **Neteja en tancar sessió**: `logout` i qualsevol `401` a `/api/auth/me` esborren les
  cachés `api-*` i les marques de frescor. Les tiles i el precache de l'app shell es
  conserven.
- **Emmagatzematge persistent**: `navigator.storage.persist()` des de `PwaBanner`. El
  navegador decideix (pot dir que no) i aquí no es fa res si falla.
- **Sense cache-buster**: `useHidrantData` ja no afegeix `?_t=<timestamp>`, que feia que
  cada petició fos una URL nova i la caché no s'encertés mai. El backend ja envia
  `no-store` per a `/api/hidrants`.

### Què no funciona sense xarxa

- `/api/auth/me` no es cacheja, així que offline l'app queda en mode lectura anònima: no
  es pot editar res. És el comportament segur, no un defecte.
- Les tiles no visitades abans no hi són i el mapa surt gris.

## Possibilitat futura: escriptura offline

No està planificada: no hi ha fase oberta ni feina començada en aquest sentit. Si algun
dia es fa, seria una cua a IndexedDB amb els canvis fets sense cobertura, reintent en
recuperar connexió i resolució de conflictes amb l'estat de sync d'OSM. Abans caldria
resoldre la idempotència al backend (`client_uuid`) i decidir com es gestionen la sessió
i els permisos sense xarxa, perquè avui l'app hi queda en lectura anònima.

## Diagnòstic

| Símptoma                                | Causa habitual                                                        | Solució                                                                               |
| --------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| No apareix el prompt d'instal·lació     | Firefox/Safari, o poc engagement, o `beforeinstallprompt` ja consumit | Instal·lar des del menú del navegador; recarregar i esperar uns segons                |
| El SW no es registra en dev             | Certificat de mkcert no confiat al dispositiu                         | Provar a `localhost` o confiar-hi el certificat                                       |
| Es veu codi antic després de desplegar  | `sw.js` cachejat per un proxy                                         | Comprovar `Cache-Control: no-cache` a `/sw.js` i fer _Unregister_ + _Clear site data_ |
| Pantalla en blanc després d'actualitzar | Barreja d'`index.html` nou amb chunks antics                          | Usar el prompt d'actualització, no activar el SW automàticament                       |
| El mapa surt gris sense connexió        | Tiles no visitades abans                                              | És l'esperat: només es cachegen les ja carregades                                     |
