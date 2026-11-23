import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { requireAuth, requirePermission } from "../plugins/authorize.js";
import { updateAdfBoundaries } from "../services/adfBoundaries.js";
import { adfIdParamsSchema } from "../utils/identifiers.js";
import type { AdfBbox, AdfCenter } from "../utils/geo.js";

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

      const row = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
      return reply.send({
        success: true,
        adf_id: adfId,
        bbox: row?.bbox ? (JSON.parse(row.bbox) as AdfBbox) : null,
        center: row?.center ? (JSON.parse(row.center) as AdfCenter) : null,
      });
    },
  );
}
