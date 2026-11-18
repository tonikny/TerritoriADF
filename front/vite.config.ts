import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import mkcert from "vite-plugin-mkcert";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    mkcert(),
    tailwindcss(),
    VitePWA({
      // El registre es fa des de React amb useRegisterSW (virtual:pwa-register/react).
      injectRegister: null,
      // Actualització automàtica: el SW nou fa skipWaiting i pren el control;
      // PwaBanner recarrega la pàgina i mostra l'avís de confirmació.
      registerType: "autoUpdate",
      // Les icones del manifest s'afegeixen soles al precache; les de la resta
      // d'assets (favicons) s'hi afegeixen explícitament per no duplicar entrades.
      includeAssets: [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "favicon-48x48.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "Territori ADF",
        short_name: "TerritoriADF",
        description: "Eines pels voluntaris/es de les Agrupacions de Defensa Forestal",
        lang: "ca",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#00552B",
        theme_color: "#00552B",
        icons: [
          {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            // Icona maskable pròpia: fons sòlid i el dibuix dins de la zona
            // segura del 80 %, perquè Android (WebAPK i la drecera de Firefox)
            // el retalla amb la forma del launcher. No es pot reutilitzar la de
            // 512 px: té les cantonades transparents i el text tocant a la vora.
            // `any maskable` i no només `maskable`: Firefox per a Android, a
            // partir d'Android 8, demana una icona alhora `any` i `maskable`
            // per construir la icona adaptativa de la drecera; si només en troba
            // de `maskable`, en queda una de genèrica.
            src: "/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,svg,woff,woff2}",
          // Imatges del mapa i logo: sense precache, sense connexió el navegador
          // no les té (nginx no els posa max-age) i els marcadors surten com una
          // imatge trencada. Són petits (~120 KB en total).
          "images/icons/*.png",
          "images/logo-horitzontal.png",
        ],
        // Les dades geogràfiques i les imatges grans no formen part de l'app shell.
        globIgnores: [
          "**/municipis/**",
          "**/geojson/**",
          "**/*.webmanifest",
          // No s'usa enlloc i fa 1 MB.
          "**/images/icons/hydrant-fire-hydrant-pngrepo-com.png",
          // jspdf i html2canvas (~600 KB) només fan falta per exportar a PDF i es
          // carreguen amb import() dinàmic: fora del precache per no inflar-lo.
          // Amb xarxa l'exportació funciona igual; sense xarxa, si el navegador no
          // té el chunk a la caché HTTP, en surt un avís i no es genera el PDF.
          "**/jspdf*.js",
          "**/html2canvas*.js",
        ],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/tiles\//],
        cleanupOutdatedCaches: true,
        // Les tessel·les no passen pel service worker: MapLibre en cancel·la
        // moltes en canviar de zoom i Firefox ho pot reportar com un error del
        // service worker. Nginx i la caché HTTP del navegador se n'encarreguen.
        runtimeCaching: [
          {
            // Lectura offline: dades de l'ADF i llista d'ADFs, xarxa primer. Si la
            // xarxa no respon en 3 s (o falla), es serveix la còpia emmagatzemada i
            // `OfflineNotice` n'indica l'antiguitat. Mai `/api/auth/*`: la sessió no
            // s'ha de poder reprendre des de la caché.
            urlPattern: /\/api\/(?:adfs|hidrants|adf\/boundary)\b/,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "api-data",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Incidències: també offline, perquè consultar-les sense cobertura és
            // prioritari a camp. Caché pròpia: el detall d'una incidència ocupa una
            // entrada per id i no ha d'expulsar les dades bàsiques de l'ADF.
            // Contrapartida acceptada: en un dispositiu compartit, un altre
            // voluntari podria veure una incidència que no és seva fins que es
            // tanqui la sessió (`api-*` s'esborra en logout i en rebre un 401).
            urlPattern: /\/api\/incidencies\b/,
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "api-incidencies",
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          // Tessel·les del mapa: CacheFirst, 30 dies i una caché per font, perquè
          // l'orto o el relleu no expulsin el mapa base. Mides mesurades al
          // Montseny (zoom 10–14): OSM ~33 KB, OpenTopoMap ~46 KB i
          // terrain-RGB de l'ICGC ~240 KB (512 px). Sostre total ~66 MB.
          // Una ADF d'uns 500 km² necessita ~200 tessel·les de 256 px per al
          // zoom 10–14 i ~60 de terrain (512 px, la meitat per eix).
          {
            urlPattern: /\/tiles\/osm\/\d+\/\d+\/\d+\.png$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-osm",
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/tiles\/opentopo\/\d+\/\d+\/\d+\.png$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-opentopo",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/tiles\/ign-raster\/\d+\/\d+\/\d+\.jpeg$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-ign-raster",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/tiles\/ign-orto\/\d+\/\d+\/\d+\.jpeg$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-ign-orto",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // El relleu 3D i el hillshade comparteixen URL, així que la segona
            // font surt de la mateixa entrada de caché.
            urlPattern: /\/tiles\/icgc-terrain\/\d+\/\d+\/\d+\.png$/,
            handler: "CacheFirst",
            options: {
              cacheName: "tiles-terrain",
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    sourcemap: false,
  },
  server: {
    host: true, // Això fa que serveixi a la IP local
    port: 3003,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3033",
        changeOrigin: false,
        secure: false,
      },
      "/tiles/osm": {
        target: "https://tile.openstreetmap.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/osm/, ""),
      },
      "/tiles/opentopo": {
        target: "https://tile.opentopomap.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/opentopo/, ""),
      },
      "/tiles/ign-raster": {
        target: "https://tms-mapa-raster.ign.es/1.0.0/mapa-raster",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/ign-raster/, ""),
      },
      "/tiles/ign-orto": {
        target: "https://tms-pnoa-ma.idee.es/1.0.0/pnoa-ma",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/ign-orto/, ""),
      },
      "/tiles/icgc-terrain": {
        target: "https://geoserveis.icgc.cat/servei/catalunya/contextmaps-terreny-5m-rgb/wmts",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles\/icgc-terrain/, ""),
      },
    },
  },
});
