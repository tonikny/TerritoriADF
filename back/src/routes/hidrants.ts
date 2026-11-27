import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { hidrantServiceTagsSchema, hidrantUiFieldsSchema } from "@territoriadf/contracts/hidrants";
import type { OsmPullSyncResult } from "@territoriadf/contracts/osm";

import { HidrantsService } from "../services/hidrantsService.js";
import { BadRequestError } from "../errors.js";
import {
  ADF_FROM_QUERY_OR_BODY,
  requireAdfScope,
  requireAuth,
  requirePermission,
} from "../plugins/authorize.js";

/**
 * Rutes d'hidrants amb handlers natius de Fastify i esquemes Zod.
 *
 * L'esquema valida la frontera (abans `ui_fields` i els tags lliures eren
 * `z.any()`), tipa el handler i alimenta l'OpenAPI. L'autorització és
 * declarativa: cada mutació diu quina capacitat necessita i d'on surt l'ADF.
 *
 * `service_tags` és informació de servei, no privada d'una ADF: qualsevol
 * sessió, de qualsevol ADF, la pot llegir (ADR 0005).
 */

const serviceTagsSchema = hidrantServiceTagsSchema;

const adfQuerySchema = z.object({
  adf: z.coerce.number().int().positive().optional(),
});

const createBodySchema = z.object({
  adf_id: z.coerce.number().int().positive().optional(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  ui_fields: hidrantUiFieldsSchema.optional(),
  service_tags: serviceTagsSchema.optional(),
});

const updateBodySchema = z.object({
  adf_id: z.coerce.number().int().positive().optional(),
  id: z.string().optional(),
  lat: z.number().finite().optional(),
  lon: z.number().finite().optional(),
  ui_fields: hidrantUiFieldsSchema.optional(),
  service_tags: serviceTagsSchema.optional(),
});

/** El cos del sync és opcional: el front només envia `force` quan força. */
const syncBodySchema = z
  .object({
    adf_id: z.coerce.number().int().positive().optional(),
    force: z.boolean().optional(),
  })
  .default({});

const idParamsSchema = z.object({ id: z.string().min(1) });

function adfIdFrom(adf: number | undefined, bodyAdfId?: number): number {
  const adfId = adf ?? bodyAdfId;
  if (!adfId) {
    throw new BadRequestError("No s'ha pogut identificar l'ADF", "ADF_NOT_IDENTIFIED");
  }
  return adfId;
}

export function registerHidrantRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // --- GET /api/hidrants: llistar hidrants de l'ADF (GeoJSON) ---
  // Públic. Amb sessió s'hi inclouen els tags de servei (`service_tags`).
  typed.get(
    "/api/hidrants",
    {
      schema: {
        tags: ["hidrants"],
        summary: "Hidrants d'una ADF en GeoJSON",
        querystring: adfQuerySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFrom(request.query.adf);
      const geoJson = await HidrantsService.getGeoJson(adfId, {
        includeServiceTags: Boolean(request.authUser),
      });
      return reply
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        .send(geoJson);
    },
  );

  // --- POST /api/hidrants/sync: sincronitzar l'ADF amb OSM ---
  typed.post(
    "/api/hidrants/sync",
    {
      preHandler: [
        requireAuth,
        requirePermission("sync_osm"),
        requireAdfScope(ADF_FROM_QUERY_OR_BODY),
      ],
      schema: {
        tags: ["hidrants"],
        summary: "Sincronitza els hidrants de l'ADF des d'OSM",
        querystring: adfQuerySchema,
        body: syncBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFrom(request.query.adf, request.body.adf_id);
      const force = request.body.force === true;
      const result = await HidrantsService.forceSync(adfId, force);
      const msg = force
        ? `Forçat des d'OSM: ${result.total} hidrants.`
        : `Sincronitzats ${result.total} hidrants d'OSM. ${result.skipped > 0 ? `${result.skipped} locals mantinguts.` : ""}${result.conflicts > 0 ? `${result.conflicts} conflictes nous.` : ""}`;
      const body: OsmPullSyncResult = { success: true, message: msg, ...result };
      return reply.send(body);
    },
  );

  // --- POST /api/hidrants: crear hidrant local ---
  typed.post(
    "/api/hidrants",
    {
      preHandler: [
        requireAuth,
        requirePermission("create_hydrant"),
        requireAdfScope(ADF_FROM_QUERY_OR_BODY),
      ],
      schema: {
        tags: ["hidrants"],
        summary: "Crea un hidrant local (PENDING_CREATE)",
        querystring: adfQuerySchema,
        body: createBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFrom(request.query.adf, request.body.adf_id);
      const { lat, lon, ui_fields, service_tags } = request.body;
      const result = HidrantsService.createLocal(adfId, lat, lon, ui_fields, service_tags);
      return reply.code(201).send(result);
    },
  );

  // --- PUT /api/hidrants/:id: actualitzar hidrant ---
  typed.put(
    "/api/hidrants/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission("edit_hydrant"),
        requireAdfScope(ADF_FROM_QUERY_OR_BODY),
      ],
      schema: {
        tags: ["hidrants"],
        summary: "Actualitza un hidrant (posició, camps del formulari i observacions)",
        params: idParamsSchema,
        querystring: adfQuerySchema,
        body: updateBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFrom(request.query.adf, request.body.adf_id);
      const id = request.params.id || request.body.id;
      if (!id) {
        throw new BadRequestError("Falta l'ID de l'hidrant", "HIDRANT_ID_MISSING");
      }
      const { lat, lon, ui_fields, service_tags } = request.body;
      const result = HidrantsService.updateLocal(id, adfId, lat, lon, ui_fields, service_tags);
      return reply.send(result);
    },
  );

  // --- DELETE /api/hidrants/:id: esborrar hidrant ---
  typed.delete(
    "/api/hidrants/:id",
    {
      preHandler: [
        requireAuth,
        requirePermission("delete_hydrant"),
        requireAdfScope(ADF_FROM_QUERY_OR_BODY),
      ],
      schema: {
        tags: ["hidrants"],
        summary: "Esborra un hidrant (o el marca PENDING_DELETE si ja és a OSM)",
        params: idParamsSchema,
        querystring: adfQuerySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFrom(request.query.adf);
      return reply.send(HidrantsService.deleteLocal(request.params.id, adfId));
    },
  );
}
