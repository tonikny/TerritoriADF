import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { adfIdSchema } from "../utils/identifiers.js";

const adfQuerySchema = z.object({
  adf: adfIdSchema("No adf id").describe("Número d'ADF (1-999)"),
});

/** GET /api/adf/boundary?adf=ID: només el GeoJSON de la frontera. */
export function registerBoundaryRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/adf/boundary",
    {
      schema: {
        tags: ["adfs"],
        summary: "GeoJSON de la frontera d'una ADF",
        querystring: adfQuerySchema,
      },
    },
    async (request, reply) => {
      const adf = db
        .select({ boundary_geojson: adfs.boundary_geojson })
        .from(adfs)
        .where(eq(adfs.id, request.query.adf))
        .get();

      if (!adf || !adf.boundary_geojson) {
        return reply.code(404).send({ error: "Boundary not found" });
      }

      return reply.send(JSON.parse(adf.boundary_geojson));
    },
  );
}
