import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre 6 és ESM-only i, dins d'un bundler, no pot localitzar el worker tot sol.
setWorkerUrl(workerUrl);
