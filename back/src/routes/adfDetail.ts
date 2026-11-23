import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { adfIdSchema } from "../utils/identifiers.js";
import { serializeAdf } from "./adfs.js";

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
      const adf = AdfsRepository.findById(request.query.adf);

      if (!adf) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }

      return reply.send(serializeAdf(adf, { includeBoundary: true }));
    },
  );
}
