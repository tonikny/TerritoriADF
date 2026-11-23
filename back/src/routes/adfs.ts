import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AdfsRepository, type AdfInsert, type AdfRow } from "../db/repositories/adfsRepository.js";
import { BadRequestError } from "../errors.js";
import { requireAuth, requirePermission } from "../plugins/authorize.js";
import { adfIdParamsSchema, adfIdSchema } from "../utils/identifiers.js";
import type { Adf, AdfBbox, AdfBoundaryFeature, AdfCenter } from "@territoriadf/contracts/adfs";

/**
 * Camps JSON d'una ADF ja parsejats. `boundary_geojson` és pesat i només surt
 * quan el client demana el detall (`GET /api/adf`); a la llista i al detall per
 * `:id` s'omet, com ja documenta `docs/DEV.md`.
 */
export function serializeAdf(adf: AdfRow, options: { includeBoundary?: boolean } = {}): Adf {
  const { boundary_geojson, ...rest } = adf;
  return {
    ...rest,
    osm_relations: JSON.parse(adf.osm_relations) as string[],
    bbox: adf.bbox ? (JSON.parse(adf.bbox) as AdfBbox) : null,
    center: adf.center ? (JSON.parse(adf.center) as AdfCenter) : null,
    ...(options.includeBoundary
      ? {
          boundary_geojson: boundary_geojson
            ? (JSON.parse(boundary_geojson) as AdfBoundaryFeature)
            : null,
        }
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
      const rows = AdfsRepository.findAll();
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
      const adf = AdfsRepository.findById(request.params.id);
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

      if (AdfsRepository.exists(adfId)) {
        throw new BadRequestError(`Ja existeix una ADF amb el número ${adfId}`);
      }

      AdfsRepository.create({
        id: adfId,
        nom,
        osm_relations: JSON.stringify(parseRelations(osm_relations)),
      });

      const row = AdfsRepository.findById(adfId)!;
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
      const target = AdfsRepository.findById(adfId);
      if (!target) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      const { nom, osm_relations } = request.body;
      const updates: Partial<Omit<AdfInsert, "id">> = {};

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

      AdfsRepository.update(adfId, updates);

      const row = AdfsRepository.findById(adfId)!;
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
      if (!AdfsRepository.exists(adfId)) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }

      const related = AdfsRepository.countRelated(adfId);
      const blockers = [
        { label: "usuaris", n: related.usuaris },
        { label: "hidrants", n: related.hidrants },
        { label: "incidències", n: related.incidencies },
        { label: "bots de Telegram", n: related.telegramBots },
      ].filter((b) => b.n > 0);

      if (blockers.length > 0) {
        const detail = blockers.map((b) => `${b.n} ${b.label}`).join(", ");
        return reply.code(409).send({
          error: `No es pot eliminar l'ADF ${adfId}: encara té ${detail} associats`,
        });
      }

      AdfsRepository.delete(adfId);
      return reply.send({ success: true });
    },
  );
}
