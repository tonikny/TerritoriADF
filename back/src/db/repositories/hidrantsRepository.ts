import { db } from "../index.js";
import { hidrants } from "../schema.js";
import { count, eq, and, ne, inArray, notInArray } from "drizzle-orm";
import type { SyncStatus } from "@territoriadf/contracts/sync";
import type {
  HidrantOsmTags,
  HidrantServiceTags,
  HidrantSyncConflict,
  HidrantSyncError,
  HidrantSyncIssue,
} from "@territoriadf/contracts/hidrants";

type ConflictDetails = Omit<HidrantSyncConflict, "kind">;

function nowISO(): string {
  return new Date().toISOString();
}

export interface HidrantData {
  id: string;
  osm_id?: number | null;
  osm_version?: number | null;
  adf_id: number | null;
  lat: number;
  lon: number;
  osm_tags?: HidrantOsmTags | null;
  /** Informació de servei: la llegeix qualsevol ADF (ADR 0005). */
  service_tags?: HidrantServiceTags | null;
  /** Reservat: només l'ADF propietària (ADR 0005). Avui sempre `{}`. */
  private_tags?: Record<string, unknown> | null;
  /** La columna és `NOT NULL DEFAULT 'SYNCED'`: mai no pot ser `null`. */
  sync_status: SyncStatus;
  sync_error?: HidrantSyncError | null;
  synced_at?: string | null;
  remote_lat?: number | null;
  remote_lon?: number | null;
  remote_osm_tags?: HidrantOsmTags | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** Fila de `GET /api/osm/pending`: la consulta ja filtra els `SYNCED`. */
type PendingHidrantData = Omit<HidrantData, "sync_status"> & {
  sync_status: Exclude<SyncStatus, "SYNCED">;
  street: string;
  num: string;
};

export const HidrantsRepository = {
  countByAdf(adfId: number): number {
    const res = db
      .select({ count: count() })
      .from(hidrants)
      .where(eq(hidrants.adf_id, adfId))
      .get();
    return res?.count || 0;
  },

  findActiveByAdf(adfId: number): HidrantData[] {
    return db
      .select()
      .from(hidrants)
      .where(
        and(
          eq(hidrants.adf_id, adfId),
          // El que s'esborrarà aviat i el que ja no és a OSM no es pinten al mapa.
          notInArray(hidrants.sync_status, ["PENDING_DELETE", "MISSING_IN_OSM"]),
        ),
      )
      .all() as HidrantData[];
  },

  findByIdAndAdf(id: string, adfId: number): HidrantData | undefined {
    return db
      .select()
      .from(hidrants)
      .where(and(eq(hidrants.id, id), eq(hidrants.adf_id, adfId)))
      .get() as HidrantData | undefined;
  },

  findByOsmId(osmId: number): HidrantData | undefined {
    return db.select().from(hidrants).where(eq(hidrants.osm_id, osmId)).get() as
      HidrantData | undefined;
  },

  /**
   * Obtenir tots els hidrants amb un sync_status determinat.
   * Utilitzat per al push sync: trobar PENDING_CREATE, PENDING_UPDATE, PENDING_DELETE.
   */
  findBySyncStatus(statuses: SyncStatus[]): HidrantData[] {
    return db
      .select()
      .from(hidrants)
      .where(inArray(hidrants.sync_status, statuses))
      .all() as HidrantData[];
  },

  /**
   * Obtenir tots els hidrants en estat CONFLICT (o els d'una ADF).
   */
  findConflicts(adfId?: number): HidrantData[] {
    return db
      .select()
      .from(hidrants)
      .where(
        adfId === undefined
          ? eq(hidrants.sync_status, "CONFLICT")
          : and(eq(hidrants.sync_status, "CONFLICT"), eq(hidrants.adf_id, adfId)),
      )
      .all() as HidrantData[];
  },

  create(data: Omit<HidrantData, "created_at" | "updated_at">): void {
    db.insert(hidrants)
      .values({
        id: data.id,
        osm_id: data.osm_id,
        osm_version: data.osm_version,
        adf_id: data.adf_id,
        lat: data.lat,
        lon: data.lon,
        osm_tags: data.osm_tags ?? {},
        service_tags: data.service_tags ?? {},
        sync_status: data.sync_status,
      })
      .run();
  },

  update(id: string, adfId: number, data: Partial<HidrantData>): void {
    db.update(hidrants)
      .set({
        lat: data.lat,
        lon: data.lon,
        osm_tags: data.osm_tags,
        service_tags: data.service_tags,
        sync_status: data.sync_status,
        updated_at: nowISO(),
      })
      .where(and(eq(hidrants.id, id), eq(hidrants.adf_id, adfId)))
      .run();
  },

  delete(id: string): void {
    db.delete(hidrants).where(eq(hidrants.id, id)).run();
  },

  markForDeletion(id: string): void {
    db.update(hidrants)
      .set({
        sync_status: "PENDING_DELETE",
        updated_at: nowISO(),
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /**
   * Marcar un hidrant com a sincronitzat amb èxit després d'una pujada a OSM.
   * Actualitza osm_id (si és creació), osm_version i synced_at.
   * ESBORRA sync_error si n'hi havia.
   */
  markSynced(id: string, osmVersion: number, osmId?: number): void {
    const now = nowISO();
    const updates: Record<string, unknown> = {
      sync_status: "SYNCED",
      osm_version: osmVersion,
      synced_at: now,
      sync_error: null,
      updated_at: now,
    };
    if (osmId !== undefined) {
      updates.osm_id = osmId;
    }
    db.update(hidrants).set(updates).where(eq(hidrants.id, id)).run();
  },

  /**
   * Marcar un hidrant com a CONFLICT després d'un 409 d'OSM.
   * Emmagatzema els detalls del conflicte a sync_error (JSON):
   * { localVersion, osmVersion, osmLat, osmLon, osmTags, diffFields }
   * NO canvia osm_version perquè la necessitem pel .osc.
   */
  markConflict(id: string, errorDetails: ConflictDetails): void {
    db.update(hidrants)
      .set({
        sync_status: "CONFLICT",
        sync_error: { kind: "conflict", ...errorDetails },
        updated_at: nowISO(),
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /**
   * Marcar un hidrant com a ERROR després d'un error inesperat.
   */
  markError(id: string, errorMessage: string): void {
    db.update(hidrants)
      .set({
        sync_status: "ERROR",
        sync_error: { kind: "error", message: errorMessage },
        updated_at: nowISO(),
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /**
   * Guardar les dades remotes d'OSM per al diff.
   * No toca les dades locals (lat, lon, osm_tags).
   */
  saveRemoteData(id: string, lat: number, lon: number, osmTags: Record<string, string>): void {
    db.update(hidrants)
      .set({
        remote_lat: lat,
        remote_lon: lon,
        remote_osm_tags: osmTags,
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /**
   * Netejar les dades remotes guardades.
   */
  clearRemoteData(id: string): void {
    db.update(hidrants)
      .set({
        remote_lat: null,
        remote_lon: null,
        remote_osm_tags: null,
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /**
   * Resoldre un conflicte: actualitzar amb les dades d'OSM (merge manual o automàtic).
   */
  resolveConflict(
    id: string,
    data: { osmVersion: number; lat: number; lon: number; osmTags: HidrantOsmTags },
  ): void {
    const now = nowISO();
    db.update(hidrants)
      .set({
        sync_status: "SYNCED",
        osm_version: data.osmVersion,
        lat: data.lat,
        lon: data.lon,
        osm_tags: data.osmTags,
        sync_error: null,
        synced_at: now,
        updated_at: now,
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /** Sense `adfId` compta tota la base; amb `adfId`, només aquella ADF. */
  getSyncStats(adfId?: number) {
    const results = db
      .select({
        status: hidrants.sync_status,
        count: count(),
      })
      .from(hidrants)
      .where(adfId === undefined ? undefined : eq(hidrants.adf_id, adfId))
      .groupBy(hidrants.sync_status)
      .all();

    const stats = {
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

    for (const res of results) {
      const status = res.status as keyof typeof stats;
      if (status in stats) {
        stats[status] = res.count;
        if (
          status !== "SYNCED" &&
          status !== "CONFLICT" &&
          status !== "ERROR" &&
          status !== "MISSING_IN_OSM"
        ) {
          stats.total_pending += res.count;
        }
      }
    }

    return stats;
  },

  /**
   * Esborrar definitivament els hidrants marcats com a MISSING_IN_OSM (el pull no
   * els ha trobat a OSM). Cal indicar ids concrets o una ADF: mai tota la base.
   * Retorna el nombre de files esborrades.
   */
  purgeMissingInOsm(opts: { adfId?: number; ids?: string[] }): number {
    const conditions = [eq(hidrants.sync_status, "MISSING_IN_OSM")];
    if (opts.ids && opts.ids.length > 0) {
      conditions.push(inArray(hidrants.id, opts.ids));
    } else if (opts.adfId) {
      conditions.push(eq(hidrants.adf_id, opts.adfId));
    } else {
      return 0;
    }
    return db
      .delete(hidrants)
      .where(and(...conditions))
      .run().changes;
  },

  markReview(id: string, issues: HidrantSyncIssue[]) {
    db.update(hidrants)
      .set({
        sync_status: "REVIEW",
        sync_error: { kind: "review", issues },
        updated_at: nowISO(),
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  findByReview(adfId?: number) {
    const conditions = [eq(hidrants.sync_status, "REVIEW")];
    if (adfId) {
      conditions.push(eq(hidrants.adf_id, adfId));
    }
    return db
      .select()
      .from(hidrants)
      .where(and(...conditions))
      .all();
  },

  /**
   * Obtenir tots els hidrants no-SYNCED d'una ADF amb detalls per a la UI.
   * Retorna tags parsejats i camps extrets (street, num).
   */
  findByAdfWithDetails(adfId: number): PendingHidrantData[] {
    const rows = db
      .select()
      .from(hidrants)
      .where(and(eq(hidrants.adf_id, adfId), ne(hidrants.sync_status, "SYNCED")))
      .all() as HidrantData[];

    return rows.map((h) => {
      const tags = h.osm_tags ?? {};
      return {
        ...h,
        // El WHERE d'aquesta consulta garanteix que no hi ha cap fila SYNCED.
        sync_status: h.sync_status as Exclude<SyncStatus, "SYNCED">,
        street: tags["addr:street"] || "",
        num: tags["addr:housenumber"] || "",
      };
    });
  },

  /**
   * Descartar els canvis locals: recupera les etiquetes remotes d'OSM del
   * darrer pull i el marca com a sincronitzat.
   */
  restoreRemoteTags(id: string, osmTags: HidrantOsmTags, syncedAt: string): void {
    db.update(hidrants)
      .set({
        osm_tags: osmTags,
        sync_status: "SYNCED",
        synced_at: syncedAt,
        updated_at: syncedAt,
      })
      .where(eq(hidrants.id, id))
      .run();
  },

  /** Inserció/actualització massiva del pull d'OSM (per `osm_id`). */
  upsertFromOsm(data: {
    id: string;
    osm_id: number;
    osm_version: number;
    adf_id: number;
    lat: number;
    lon: number;
    osm_tags: HidrantOsmTags;
    synced_at: string;
  }): void {
    db.insert(hidrants)
      .values({
        ...data,
        sync_status: "SYNCED",
        updated_at: data.synced_at,
      })
      .onConflictDoUpdate({
        target: hidrants.id,
        set: {
          osm_id: data.osm_id,
          lat: data.lat,
          lon: data.lon,
          osm_version: data.osm_version,
          osm_tags: data.osm_tags,
          sync_status: "SYNCED",
          synced_at: data.synced_at,
          updated_at: data.synced_at,
        },
      })
      .run();
  },

  /**
   * Marca com a MISSING_IN_OSM els hidrants SYNCED de l'ADF que ja no surten
   * al pull. Retorna el nombre de files marcades.
   */
  markMissingInOsm(adfId: number, currentOsmIds: number[], timestamp: string): number {
    const missingCondition =
      currentOsmIds.length > 0
        ? and(
            eq(hidrants.adf_id, adfId),
            eq(hidrants.sync_status, "SYNCED"),
            notInArray(hidrants.osm_id, currentOsmIds),
          )
        : and(eq(hidrants.adf_id, adfId), eq(hidrants.sync_status, "SYNCED"));

    return db
      .update(hidrants)
      .set({ sync_status: "MISSING_IN_OSM", updated_at: timestamp })
      .where(missingCondition)
      .run().changes;
  },

  /**
   * Marcar múltiples hidrants com a SYNCED (descartar canvis).
   */
  markManySynced(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    const now = nowISO();
    db.update(hidrants)
      .set({
        sync_status: "SYNCED",
        sync_error: null,
        synced_at: now,
        updated_at: now,
      })
      .where(inArray(hidrants.id, ids))
      .run();
  },

  /**
   * Obtenir hidrants per IDs.
   */
  findByIds(ids: string[]): HidrantData[] {
    if (ids.length === 0) {
      return [];
    }
    return db.select().from(hidrants).where(inArray(hidrants.id, ids)).all() as HidrantData[];
  },

  /**
   * Esborrar múltiples hidrants per IDs.
   */
  deleteMany(ids: string[]) {
    if (ids.length === 0) {
      return;
    }
    db.delete(hidrants).where(inArray(hidrants.id, ids)).run();
  },
};
