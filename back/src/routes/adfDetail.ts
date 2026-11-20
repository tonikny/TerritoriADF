import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { adfIdSchema } from "../utils/identifiers.js";

const adfQuerySchema = z.object({
  adf: adfIdSchema("Falta adf id").describe("Número d'ADF (1-999)"),
});

/** GET /api/adf?adf=ID: detall d'una ADF amb els camps JSON ja parsejats. */
export function registerAdfDetailRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/adf",
    {
      schema: {
        tags: ["adfs"],
        summary: "Detall d'una ADF (per query `adf`)",
        querystring: adfQuerySchema,
      },
    },
    async (request, reply) => {
      const adf = db.select().from(adfs).where(eq(adfs.id, request.query.adf)).get();

      if (!adf) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }

      return reply.send({
        ...adf,
        osm_relations: JSON.parse(adf.osm_relations),
        bbox: adf.bbox ? JSON.parse(adf.bbox) : null,
        center: adf.center ? JSON.parse(adf.center) : null,
        boundary_geojson: adf.boundary_geojson ? JSON.parse(adf.boundary_geojson) : null,
      });
    },
  );
}
