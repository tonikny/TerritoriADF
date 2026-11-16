import { getQueryParam } from "../../utils/urlParams";
import { storageKey } from "../../utils/storageKeys";
import type { EngineId } from "./types";

export type EnginePreference = "auto" | EngineId;

const PREFERENCE_KEY = storageKey("map_engine");
const FALLBACK_KEY = storageKey("map_engine_fallback");
const VALID: readonly string[] = ["auto", "leaflet", "maplibre"];

let webgl2Cache: boolean | null = null;

/** Comprovació barata i memoïtzada: MapLibre 6 requereix WebGL2. */
export function detectWebgl2(): boolean {
  if (webgl2Cache !== null) {
    return webgl2Cache;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webgl2Cache = canvas.getContext("webgl2") !== null;
  } catch {
    webgl2Cache = false;
  }
  return webgl2Cache;
}

export function readEnginePreference(): EnginePreference {
  const fromUrl = getQueryParam("engine");
  if (fromUrl === "leaflet" || fromUrl === "maplibre") {
    return fromUrl;
  }
  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    if (stored && VALID.includes(stored)) {
      return stored as EnginePreference;
    }
  } catch {
    /* storage no disponible: automàtic */
  }
  return "auto";
}

export function storeEnginePreference(preference: EnginePreference): void {
  try {
    if (preference === "auto") {
      localStorage.removeItem(PREFERENCE_KEY);
    } else {
      localStorage.setItem(PREFERENCE_KEY, preference);
    }
  } catch {
    /* ignorem */
  }
}

/** Un error fatal del motor no es reintenta durant la resta de la sessió. */
export function markEngineFailure(): void {
  try {
    sessionStorage.setItem(FALLBACK_KEY, "1");
  } catch {
    /* ignorem */
  }
}

export function clearEngineFailure(): void {
  try {
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* ignorem */
  }
}

export function hasSessionFallback(): boolean {
  try {
    return sessionStorage.getItem(FALLBACK_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Ordre: override d'URL > fallback de sessió > preferència > WebGL2 > Leaflet.
 * `preference` per defecte es llegeix de l'URL/localStorage.
 */
export function resolveEngine(
  preferenceOverride?: EnginePreference,
  webgl2: boolean = detectWebgl2(),
): EngineId {
  const preference = preferenceOverride ?? readEnginePreference();
  // Un `?engine=` explícit ha de poder forçar el motor encara que la sessió
  // hagi caigut abans a Leaflet per un error fatal.
  const urlEngine = preferenceOverride === undefined ? getQueryParam("engine") : null;
  if (urlEngine === "maplibre" || urlEngine === "leaflet") {
    return urlEngine === "maplibre" && webgl2 ? "maplibre" : "leaflet";
  }
  if (hasSessionFallback()) {
    return "leaflet";
  }
  if (preference === "leaflet") {
    return "leaflet";
  }
  if (preference === "maplibre") {
    return webgl2 ? "maplibre" : "leaflet";
  }
  return webgl2 ? "maplibre" : "leaflet";
}

export function selectEngine(): EngineId {
  return resolveEngine();
}
