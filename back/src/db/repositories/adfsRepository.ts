import { count, eq, inArray } from "drizzle-orm";
import type { AdfBbox, AdfBoundaryFeature, AdfCenter } from "@territoriadf/contracts/adfs";
import { db } from "../index.js";
import { adfs, hidrants, incidencies, telegramBots, users } from "../schema.js";

export type AdfRow = typeof adfs.$inferSelect;
export type AdfInsert = typeof adfs.$inferInsert;
export type AdfUpdate = Partial<Omit<AdfInsert, "id">>;

/**
 * Accés a la taula `adfs`. Totes les consultes de la resta de capes (rutes i
 * serveis) passen per aquí: cap d'elles importa `db` ni l'esquema.
 */
export const AdfsRepository = {
  findAll(): AdfRow[] {
    return db.select().from(adfs).all();
  },

  findById(id: number): AdfRow | undefined {
    return db.select().from(adfs).where(eq(adfs.id, id)).get();
  },

  findName(id: number): string | null {
    return db.select({ nom: adfs.nom }).from(adfs).where(eq(adfs.id, id)).get()?.nom ?? null;
  },

  exists(id: number): boolean {
    return !!db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, id)).get();
  },

  findNamesByIds(ids: number[]): string[] {
    if (ids.length === 0) {
      return [];
    }
    return db
      .select({ nom: adfs.nom })
      .from(adfs)
      .where(inArray(adfs.id, ids))
      .all()
      .map((row) => row.nom);
  },

  /** Només el GeoJSON de la frontera: la resta de camps de l'ADF és pesada. */
  findBoundary(id: number): AdfBoundaryFeature | null {
    return (
      db.select({ boundary_geojson: adfs.boundary_geojson }).from(adfs).where(eq(adfs.id, id)).get()
        ?.boundary_geojson ?? null
    );
  },

  /** IDs de les ADFs que comparteixen el tracking amb la resta (opt-in). */
  findTrackingSharedIds(): number[] {
    return db
      .select({ id: adfs.id })
      .from(adfs)
      .where(eq(adfs.tracking_shared, true))
      .all()
      .map((row) => row.id);
  },

  create(data: AdfInsert): void {
    db.insert(adfs).values(data).run();
  },

  update(id: number, data: AdfUpdate): void {
    if (Object.keys(data).length === 0) {
      return;
    }
    db.update(adfs).set(data).where(eq(adfs.id, id)).run();
  },

  saveBoundaries(
    id: number,
    data: { bbox: AdfBbox; center: AdfCenter; boundary_geojson: AdfBoundaryFeature },
  ): void {
    db.update(adfs).set(data).where(eq(adfs.id, id)).run();
  },

  setTrackingShared(id: number, shared: boolean): void {
    db.update(adfs).set({ tracking_shared: shared }).where(eq(adfs.id, id)).run();
  },

  delete(id: number): void {
    db.delete(adfs).where(eq(adfs.id, id)).run();
  },

  /** Files associades que impedeixen esborrar una ADF. */
  countRelated(id: number): {
    usuaris: number;
    hidrants: number;
    incidencies: number;
    telegramBots: number;
  } {
    const countFor = (
      table: typeof users | typeof hidrants | typeof incidencies | typeof telegramBots,
    ) => db.select({ n: count() }).from(table).where(eq(table.adf_id, id)).get()?.n ?? 0;

    return {
      usuaris: countFor(users),
      hidrants: countFor(hidrants),
      incidencies: countFor(incidencies),
      telegramBots: countFor(telegramBots),
    };
  },
};
