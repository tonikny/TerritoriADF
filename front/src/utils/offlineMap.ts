// Descàrrega anticipada de les tessel·les d'una ADF per poder fer servir el
// mapa sense cobertura. Les peticions surten de la pàgina i passen pel service
// worker, que les desa a les cachés `tiles-*` (vegeu `front/vite.config.ts`).

import { bboxToBounds } from "../map/core/geometry";
import type { GeoBounds } from "../map/core/types";
import { BASEMAPS } from "../map/shared/basemaps";
import { storageKey } from "./storageKeys";

/** `bbox` del backend: [minLat, minLon, maxLat, maxLon]. */
type AdfBbox = readonly [number, number, number, number];

export const OFFLINE_MIN_ZOOM = 10;
export const OFFLINE_MAX_ZOOM = 15;
const TERRAIN_MIN_ZOOM = 6;
const TERRAIN_MAX_ZOOM = 14;
const TERRAIN_TILE_URL = "/tiles/icgc-terrain/{z}/{x}/{y}.png";

/** Més enllà d'això la descàrrega no és raonable: es demana recalcular o esperar. */
const MAX_TILES = 3000;
const DOWNLOAD_CONCURRENCY = 4;
/** Pausa entre peticions de cada worker, per no castigar els servidors de tessel·les. */
const DOWNLOAD_PAUSE_MS = 60;
const MAX_LAT = 85.05112878;

/** Mides mitjanes mesurades al Montseny (zoom 10–14). */
const AVG_TILE_BYTES: Record<string, number> = {
  osm: 33_000,
  opentopo: 46_000,
  "ign-raster": 30_000,
  "ign-orto": 30_000,
  terrain: 240_000,
};

export interface OfflineMapPlan {
  urls: string[];
  tiles: number;
  bytes: number;
  /** L'àrea és massa gran per descarregar-la de cop. */
  exceedsLimit: boolean;
}

const EMPTY_PLAN: OfflineMapPlan = { urls: [], tiles: 0, bytes: 0, exceedsLimit: false };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function tileX(lon: number, z: number): number {
  return clamp(Math.floor(((lon + 180) / 360) * 2 ** z), 0, 2 ** z - 1);
}

function tileY(lat: number, z: number): number {
  const rad = (clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180;
  const n = 2 ** z;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return clamp(y, 0, n - 1);
}

function tileGrid(bounds: GeoBounds, z: number) {
  return {
    x0: tileX(bounds.west, z),
    x1: tileX(bounds.east, z),
    y0: tileY(bounds.north, z),
    y1: tileY(bounds.south, z),
  };
}

type TileSource = {
  template: string;
  /** Els serveis IGN declaren `scheme: "tms"`: cal invertir la y. */
  tms: boolean;
  avgBytes: number;
  minZoom: number;
  maxZoom: number;
};

function tileSources(): TileSource[] {
  const basemaps = BASEMAPS.flatMap((basemap) => {
    const template = basemap.raster.tiles?.[0];
    if (!template) {
      return [];
    }
    return [
      {
        template,
        tms: basemap.raster.scheme === "tms",
        avgBytes: AVG_TILE_BYTES[basemap.raster.id] ?? 30_000,
        minZoom: OFFLINE_MIN_ZOOM,
        maxZoom: OFFLINE_MAX_ZOOM,
      },
    ];
  });
  return [
    ...basemaps,
    {
      template: TERRAIN_TILE_URL,
      tms: false,
      avgBytes: AVG_TILE_BYTES.terrain,
      minZoom: TERRAIN_MIN_ZOOM,
      maxZoom: TERRAIN_MAX_ZOOM,
    },
  ];
}

function countTiles(source: TileSource, bounds: GeoBounds): number {
  let total = 0;
  for (let z = source.minZoom; z <= source.maxZoom; z += 1) {
    const { x0, x1, y0, y1 } = tileGrid(bounds, z);
    total += (x1 - x0 + 1) * (y1 - y0 + 1);
  }
  return total;
}

/** Tessel·les que caldria baixar per cobrir l'ADF, amb la mida estimada. */
export function buildOfflineMapPlan(bbox: AdfBbox | null): OfflineMapPlan {
  if (!bbox) {
    return EMPTY_PLAN;
  }
  const bounds = bboxToBounds(bbox);
  const sources = tileSources();

  const tiles = sources.reduce((sum, source) => sum + countTiles(source, bounds), 0);
  if (tiles === 0) {
    return EMPTY_PLAN;
  }
  if (tiles > MAX_TILES) {
    return { ...EMPTY_PLAN, tiles, exceedsLimit: true };
  }

  const urls: string[] = [];
  let bytes = 0;
  for (const source of sources) {
    for (let z = source.minZoom; z <= source.maxZoom; z += 1) {
      const { x0, x1, y0, y1 } = tileGrid(bounds, z);
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          const ty = source.tms ? 2 ** z - 1 - y : y;
          urls.push(
            source.template
              .replace("{z}", String(z))
              .replace("{x}", String(x))
              .replace("{y}", String(ty)),
          );
          bytes += source.avgBytes;
        }
      }
    }
  }

  return { urls, tiles: urls.length, bytes, exceedsLimit: false };
}

/**
 * Sense service worker actiu les tessel·les no arriben a la caché, així que
 * cal comprovar-ho abans de començar (amb `autoUpdate` passa sol, però pot
 * requerir una recàrrega si la pàgina s'ha obert abans d'activar-se).
 */
export async function ensureTileCacheReady(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Aquest navegador no suporta service workers: no es pot desar el mapa.");
  }
  if (navigator.serviceWorker.controller) {
    return;
  }
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), 5000);
    }),
  ]);
  if (!navigator.serviceWorker.controller) {
    throw new Error(
      "El service worker encara no controla la pàgina. Recarrega-la i torna-ho a provar.",
    );
  }
}

export interface DownloadResult {
  failed: number;
}

/** Baixa les tessel·les en paral·lel; el service worker se n'encarrega de desar-les. */
export async function downloadOfflineMap(
  urls: string[],
  {
    signal,
    onProgress,
  }: {
    signal: AbortSignal;
    onProgress: (done: number, total: number) => void;
  },
): Promise<DownloadResult> {
  let next = 0;
  let done = 0;
  let failed = 0;

  const run = async (): Promise<void> => {
    while (next < urls.length) {
      if (signal.aborted) {
        return;
      }
      const url = urls[next];
      next += 1;
      try {
        const response = await fetch(url, { signal, credentials: "same-origin" });
        if (!response.ok) {
          failed += 1;
        } else {
          // Consumir el cos assegura que la tessel·la s'acaba de baixar.
          await response.blob();
        }
      } catch {
        if (signal.aborted) {
          return;
        }
        failed += 1;
      }
      done += 1;
      onProgress(done, urls.length);
      await new Promise((resolve) => {
        setTimeout(resolve, DOWNLOAD_PAUSE_MS);
      });
    }
  };

  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, run));
  return { failed };
}

export interface OfflineMapInfo {
  at: number;
  tiles: number;
}

const INFO_PREFIX = storageKey("offline_map");

const infoKey = (adfId: number) => `${INFO_PREFIX}:${adfId}`;

export function getOfflineMapInfo(adfId: number): OfflineMapInfo | null {
  try {
    const raw = localStorage.getItem(infoKey(adfId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<OfflineMapInfo>;
    return typeof parsed.at === "number" && typeof parsed.tiles === "number"
      ? { at: parsed.at, tiles: parsed.tiles }
      : null;
  } catch {
    return null;
  }
}

export function saveOfflineMapInfo(adfId: number, info: OfflineMapInfo): void {
  try {
    localStorage.setItem(infoKey(adfId), JSON.stringify(info));
  } catch {
    /* sense localStorage només es perd la marca de "desat" */
  }
}
