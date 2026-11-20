import { count, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import { adfs, hidrants, incidencies, telegramBots, users } from "../db/schema.js";
import { BadRequestError } from "../errors.js";
import { requireAuth, requirePermission } from "../plugins/authorize.js";
import { adfIdParamsSchema, adfIdSchema } from "../utils/identifiers.js";

type AdfRow = typeof adfs.$inferSelect;

/**
 * Camps JSON d'una ADF ja parsejats. `boundary_geojson` és pesat i només surt
 * quan el client demana el detall (`GET /api/adf`); a la llista i al detall per
 * `:id` s'omet, com ja documenta `docs/DEV.md`.
 */
export function serializeAdf(adf: AdfRow, options: { includeBoundary?: boolean } = {}) {
  const { boundary_geojson, ...rest } = adf;
  return {
    ...rest,
    osm_relations: JSON.parse(adf.osm_relations) as string[],
    bbox: adf.bbox ? JSON.parse(adf.bbox) : null,
    center: adf.center ? JSON.parse(adf.center) : null,
    ...(options.includeBoundary
      ? { boundary_geojson: boundary_geojson ? JSON.parse(boundary_geojson) : null }
      : {}),
  };
}

const RELATIONS_MESSAGE = "Cal almenys una relació OSM vàlida (p. ex. R345695)";
const ADF_NUMBER_MESSAGE = "El número d'ADF ha de ser un enter entre 1 i 999";

/**
 * Accepta `["R345695"]`, `"R345695, 345699"` o `"R345695 R345699"` i retorna la
 * llista normalitzada; `[]` si no hi ha cap relació vàlida.
 */
function parseRelations(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(/[\s,;]+/) : value;
  if (!Array.isArray(raw)) {
    return [];
  }
  const relations = raw
    .map((r) => String(r).trim().toUpperCase())
    .filter(Boolean)
    .map((r) => (/^\d+$/.test(r) ? `R${r}` : r));
  if (relations.some((r) => !/^[RWN]\d+$/.test(r))) {
    return [];
  }
  return [...new Set(relations)];
}

const relationsSchema = z
  .union([z.string(), z.array(z.union([z.string(), z.number()]))], RELATIONS_MESSAGE)
  .refine((value) => parseRelations(value).length > 0, RELATIONS_MESSAGE)
  .describe("Relacions OSM: array o text separat per comes/espais (p. ex. R345695)");

const createBodySchema = z.object({
  id: adfIdSchema(ADF_NUMBER_MESSAGE).describe("Número d'ADF (1-999)"),
  nom: z
    .string("El nom de l'ADF és obligatori")
    .trim()
    .min(1, "El nom de l'ADF és obligatori")
    .describe("Nom de l'ADF"),
  osm_relations: relationsSchema,
});

const updateBodySchema = z.object({
  nom: z
    .string()
    .trim()
    .min(1, "El nom de l'ADF no pot estar buit")
    .optional()
    .describe("Nom de l'ADF (opcional)"),
  osm_relations: relationsSchema.optional(),
});

/**
 * CRUD d'ADFs. La lectura és pública; crear, modificar i eliminar demana
 * `manage_adfs` (només admin). L'esquema valida el contracte (id 1..999, nom no
 * buit, almenys una relació OSM vàlida).
 */
export function registerAdfRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // GET /api/adfs: llista d'ADFs.
  typed.get(
    "/api/adfs",
    { schema: { tags: ["adfs"], summary: "Llista d'ADFs amb els camps JSON parsejats" } },
    async (_request, reply) => {
      const rows = db.select().from(adfs).all();
      return reply.send(rows.map((row) => serializeAdf(row)));
    },
  );

  // GET /api/adfs/:id: detall d'una ADF.
  typed.get(
    "/api/adfs/:id",
    {
      schema: { tags: ["adfs"], summary: "Detall d'una ADF", params: adfIdParamsSchema },
    },
    async (request, reply) => {
      const adf = db.select().from(adfs).where(eq(adfs.id, request.params.id)).get();
      if (!adf) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      return reply.send(serializeAdf(adf));
    },
  );

  // POST /api/adfs: crear una ADF.
  typed.post(
    "/api/adfs",
    {
      preHandler: [requireAuth, requirePermission("manage_adfs")],
      schema: {
        tags: ["adfs"],
        summary: "Crea una ADF (només admin)",
        body: createBodySchema,
      },
    },
    async (request, reply) => {
      const { id: adfId, nom, osm_relations } = request.body;

      if (db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get()) {
        throw new BadRequestError(`Ja existeix una ADF amb el número ${adfId}`);
      }

      db.insert(adfs)
        .values({
          id: adfId,
          nom,
          osm_relations: JSON.stringify(parseRelations(osm_relations)),
        })
        .run();

      const row = db.select().from(adfs).where(eq(adfs.id, adfId)).get()!;
      return reply.code(201).send(serializeAdf(row));
    },
  );

  // PUT /api/adfs/:id: modificar nom i/o relacions OSM.
  typed.put(
    "/api/adfs/:id",
    {
      preHandler: [requireAuth, requirePermission("manage_adfs")],
      schema: {
        tags: ["adfs"],
        summary: "Modifica una ADF (nom i/o relacions OSM)",
        params: adfIdParamsSchema,
        body: updateBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      const target = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
      if (!target) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      const { nom, osm_relations } = request.body;
      const updates: Partial<typeof adfs.$inferInsert> = {};

      if (nom !== undefined) {
        updates.nom = nom;
      }

      if (osm_relations !== undefined) {
        const relations = parseRelations(osm_relations);
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
      return reply.send(serializeAdf(row));
    },
  );

  // DELETE /api/adfs/:id: eliminar una ADF sense dades associades.
  typed.delete(
    "/api/adfs/:id",
    {
      preHandler: [requireAuth, requirePermission("manage_adfs")],
      schema: {
        tags: ["adfs"],
        summary: "Elimina una ADF sense dades associades (409 si en té)",
        params: adfIdParamsSchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      const target = db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get();
      if (!target) {
        return reply.code(404).send({ error: "ADF no trobada" });
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
        return reply.code(409).send({
          error: `No es pot eliminar l'ADF ${adfId}: encara té ${detail} associats`,
        });
      }

      db.delete(adfs).where(eq(adfs.id, adfId)).run();
      return reply.send({ success: true });
    },
  );
}
