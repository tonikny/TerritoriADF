import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { requireAuth, requirePermission } from "../plugins/authorize.js";
import { updateAdfBoundaries } from "../services/adfBoundaries.js";
import { adfIdParamsSchema } from "../utils/identifiers.js";

/**
 * POST /api/adfs/:id/boundaries
 * Recalcula `bbox`, `center` i `boundary_geojson` a partir de les relacions OSM
 * de l'ADF (Nominatim). Només admin (permís `manage_adfs`): és una operació
 * costosa i externa.
 */
export function registerAdfBoundaryRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/api/adfs/:id/boundaries",
    {
      preHandler: [requireAuth, requirePermission("manage_adfs")],
      schema: {
        tags: ["adfs"],
        summary: "Recalcula els límits territorials de l'ADF des d'OSM",
        params: adfIdParamsSchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;

      await updateAdfBoundaries(adfId);

      const row = AdfsRepository.findById(adfId);
      return reply.send({
        success: true,
        adf_id: adfId,
        bbox: row?.bbox ?? null,
        center: row?.center ?? null,
      });
    },
  );
}
