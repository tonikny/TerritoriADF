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
        background_color: "#000000",
        theme_color: "#00552B",
        icons: [
          {
            src: "/android-chrome-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/android-chrome-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff,woff2}"],
        // Les dades geogràfiques i les imatges no formen part de l'app shell.
        globIgnores: ["**/images/**", "**/municipis/**", "**/geojson/**", "**/*.webmanifest"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/tiles\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Tiles mateix origen (proxy de Nginx): cache-first amb topall d'espai.
            urlPattern: /\/tiles\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Lectura offline: dades de l'ADF i llista d'ADFs, xarxa primer. Si la
            // xarxa no respon en 3 s (o falla), es serveix la còpia emmagatzemada i
            // `OfflineNotice` n'indica l'antiguitat. Mai `/api/auth/*`: la sessió no
            // s'ha de poder reprendre des de la caché.
            urlPattern: /\/api\/(?:adfs|hidrants|incidencies|adf\/boundary)\b/,
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
    },
  },
});
