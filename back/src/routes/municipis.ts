import { db } from "../db/index.js";
import { adfs, hidrants, incidencies, telegramBots, users } from "../db/schema.js";
import type { ApiHandler } from "../types.js";
import { count, eq } from "drizzle-orm";
import { BadRequestError } from "../errors.js";

type AdfRow = typeof adfs.$inferSelect;

function serialize(adf: AdfRow) {
  return {
    ...adf,
    osm_relations: JSON.parse(adf.osm_relations),
    bbox: adf.bbox ? JSON.parse(adf.bbox) : null,
    center: adf.center ? JSON.parse(adf.center) : null,
  };
}

function parseAdfId(value: unknown): number | null {
  const adfId = Number(value);
  // Els noms d'usuari comencen per l'ID d'ADF en 3 dígits (`ID/YYY`), així que el rang és 1..999.
  if (!Number.isInteger(adfId) || adfId < 1 || adfId > 999) {
    return null;
  }
  return adfId;
}

/** Accepta `["R345695"]`, `"R345695, 345699"` o `"R345695 R345699"`. */
function parseRelations(value: unknown): string[] | null {
  const raw = typeof value === "string" ? value.split(/[\s,;]+/) : value;
  if (!Array.isArray(raw)) {
    return null;
  }
  const relations = raw
    .map((r) => String(r).trim().toUpperCase())
    .filter(Boolean)
    .map((r) => (/^\d+$/.test(r) ? `R${r}` : r));
  if (relations.some((r) => !/^[RWN]\d+$/.test(r))) {
    return null;
  }
  return [...new Set(relations)];
}

function parseNom(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value.trim();
}

/** GET /api/adfs: llista d'ADFs. */
export const list: ApiHandler = async (_req, res) => {
  const rows = db.select().from(adfs).all();
  return res.json(rows.map(serialize));
};

/** GET /api/adfs/:id: detall d'una ADF. */
export const detail: ApiHandler = async (req, res) => {
  const adfId = parseAdfId(req.params?.id);
  if (adfId === null) {
    return res.status(400).json({ error: "ID d'ADF no vàlid" });
  }
  const adf = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
  if (!adf) {
    return res.status(404).json({ error: "ADF no trobada" });
  }
  return res.json(serialize(adf));
};

/** POST /api/adfs: crear una ADF (permís `manage_adfs`, només admin). */
export const create: ApiHandler = async (req, res) => {
  const { id, nom, osm_relations } = req.body ?? {};

  const adfId = parseAdfId(id);
  if (adfId === null) {
    throw new BadRequestError("El número d'ADF ha de ser un enter entre 1 i 999");
  }
  const adfNom = parseNom(nom);
  if (!adfNom) {
    throw new BadRequestError("El nom de l'ADF és obligatori");
  }
  const relations = parseRelations(osm_relations);
  if (!relations || relations.length === 0) {
    throw new BadRequestError("Cal almenys una relació OSM vàlida (p. ex. R345695)");
  }
  if (db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get()) {
    throw new BadRequestError(`Ja existeix una ADF amb el número ${adfId}`);
  }

  db.insert(adfs)
    .values({
      id: adfId,
      nom: adfNom,
      osm_relations: JSON.stringify(relations),
    })
    .run();

  const row = db.select().from(adfs).where(eq(adfs.id, adfId)).get()!;
  return res.status(201).json(serialize(row));
};

/** PUT /api/adfs/:id: modificar nom i/o relacions OSM (permís `manage_adfs`). */
export const update: ApiHandler = async (req, res) => {
  const adfId = parseAdfId(req.params?.id);
  if (adfId === null) {
    return res.status(400).json({ error: "ID d'ADF no vàlid" });
  }
  const target = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
  if (!target) {
    return res.status(404).json({ error: "ADF no trobada" });
  }
  const { nom, osm_relations } = req.body ?? {};
  const updates: Partial<typeof adfs.$inferInsert> = {};

  if (nom !== undefined) {
    const adfNom = parseNom(nom);
    if (!adfNom) {
      throw new BadRequestError("El nom de l'ADF no pot estar buit");
    }
    updates.nom = adfNom;
  }

  if (osm_relations !== undefined) {
    const relations = parseRelations(osm_relations);
    if (!relations || relations.length === 0) {
      throw new BadRequestError("Cal almenys una relació OSM vàlida (p. ex. R345695)");
    }
    const previous = JSON.parse(target.osm_relations) as string[];
    if (JSON.stringify(previous) !== JSON.stringify(relations)) {
      updates.osm_relations = JSON.stringify(relations);
      // Els límits territorials deriven de les relacions: queden pendents de recalcular.
      updates.bbox = null;
      updates.center = null;
      updates.boundary_geojson = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    db.update(adfs).set(updates).where(eq(adfs.id, adfId)).run();
  }

  const row = db.select().from(adfs).where(eq(adfs.id, adfId)).get()!;
  return res.json(serialize(row));
};

/** DELETE /api/adfs/:id: eliminar una ADF sense dades associades (permís `manage_adfs`). */
export const remove: ApiHandler = async (req, res) => {
  const adfId = parseAdfId(req.params?.id);
  if (adfId === null) {
    return res.status(400).json({ error: "ID d'ADF no vàlid" });
  }
  const target = db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get();
  if (!target) {
    return res.status(404).json({ error: "ADF no trobada" });
  }

  const countFor = (
    table: typeof users | typeof hidrants | typeof incidencies | typeof telegramBots,
  ) => db.select({ n: count() }).from(table).where(eq(table.adf_id, adfId)).get()?.n ?? 0;

  const blockers = [
    { label: "usuaris", n: countFor(users) },
    { label: "hidrants", n: countFor(hidrants) },
    { label: "incidències", n: countFor(incidencies) },
    { label: "bots de Telegram", n: countFor(telegramBots) },
  ].filter((b) => b.n > 0);

  if (blockers.length > 0) {
    const detail = blockers.map((b) => `${b.n} ${b.label}`).join(", ");
    return res.status(409).json({
      error: `No es pot eliminar l'ADF ${adfId}: encara té ${detail} associats`,
    });
  }

  db.delete(adfs).where(eq(adfs.id, adfId)).run();
  return res.json({ success: true });
};
