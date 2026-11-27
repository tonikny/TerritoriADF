// Vocabulari del panell d'OSM: com es diu i com s'agrupa cada estat de sync.
// És pur perquè la vista només decideixi què pintar, no com interpretar-ho.
import type { OsmSyncStats, PendingHidrant } from "@territoriadf/contracts/osm";

export type SectionKey = PendingHidrant["sync_status"];

/** Comptadors buits per quan encara no hi ha cap ADF activa. */
export const EMPTY_SYNC_STATS: OsmSyncStats = {
  SYNCED: 0,
  MISSING_IN_OSM: 0,
  PENDING_CREATE: 0,
  PENDING_UPDATE: 0,
  PENDING_DELETE: 0,
  CONFLICT: 0,
  ERROR: 0,
  REVIEW: 0,
  total_pending: 0,
};

export const SECTION_CONFIG: Record<SectionKey, { label: string; color: string; hint: string }> = {
  PENDING_CREATE: {
    label: "Nous locals",
    color: "text-primary",
    hint: "Hidrants creats localment, encara no pujats a OSM.",
  },
  PENDING_UPDATE: {
    label: "Edicions pendents",
    color: "text-primary",
    hint: "Hidrants modificats localment, pendent de pujar a OSM.",
  },
  PENDING_DELETE: {
    label: "Esborraments pendents",
    color: "text-alert",
    hint: "Hidrants marcats per esborrar, pendent d'eliminar a OSM.",
  },
  CONFLICT: {
    label: "Conflictes",
    color: "text-warn",
    hint: "OSM té dades diferents. Tria si vols mantenir la versió local o la d'OSM.",
  },
  ERROR: {
    label: "Errors",
    color: "text-alert",
    hint: "Error durant l'última sincronització. Pots reintentar o descartar.",
  },
  REVIEW: {
    label: "Per revisar",
    color: "text-warn",
    hint: "Dades amb warnings de validació. Revisa-les abans de pujar.",
  },
  MISSING_IN_OSM: {
    label: "Ja no són a OSM",
    color: "text-muted",
    hint: "L'últim pull no els ha trobat a OSM. Es conserven amb les seves dades locals fins que els esborris.",
  },
};

/** Ordre de les seccions al panell (no depèn de l'ordre de l'objecte). */
export const SECTION_ORDER: SectionKey[] = [
  "PENDING_CREATE",
  "PENDING_UPDATE",
  "PENDING_DELETE",
  "CONFLICT",
  "ERROR",
  "REVIEW",
  "MISSING_IN_OSM",
];

export function hidrantLabel(h: PendingHidrant): string {
  if (h.street) {
    return `${h.street}${h.num ? `, ${h.num}` : ""}`;
  }
  return h.osm_id ? `OSM ${h.osm_id}` : h.id.slice(0, 8);
}

/** Agrupa els pendents per estat, amb totes les claus presents. */
export function groupPending(pending: PendingHidrant[]): Record<SectionKey, PendingHidrant[]> {
  const grouped: Record<SectionKey, PendingHidrant[]> = {
    PENDING_CREATE: [],
    PENDING_UPDATE: [],
    PENDING_DELETE: [],
    CONFLICT: [],
    ERROR: [],
    REVIEW: [],
    MISSING_IN_OSM: [],
  };
  for (const h of pending) {
    grouped[h.sync_status].push(h);
  }
  return grouped;
}
