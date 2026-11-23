import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { TrackingSharingResult } from "@territoriadf/contracts/adfs";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { requireAdfScope, requireAuth, requirePermission } from "../plugins/authorize.js";
import { adfIdParamsSchema } from "../utils/identifiers.js";

const bodySchema = z.object({ shared: z.boolean().optional() });

/**
 * PUT /api/adfs/:id/tracking-sharing
 * Comparteix/revoca el tracking d'una ADF amb la resta d'ADFs (opt-in global).
 * Permís `manage_own_adf_sharing` i abast ADF declarats al `preHandler`.
 */
export function registerTrackingSharingRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.put(
    "/api/adfs/:id/tracking-sharing",
    {
      preHandler: [
        requireAuth,
        requirePermission("manage_own_adf_sharing"),
        requireAdfScope([{ from: "params", key: "id" }]),
      ],
      schema: {
        tags: ["tracking"],
        summary: "Activa o revoca la compartició de tracking de l'ADF",
        params: adfIdParamsSchema,
        body: bodySchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      const shared = request.body.shared === true;

      const adf = AdfsRepository.findById(adfId);
      if (!adf) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }

      AdfsRepository.setTrackingShared(adfId, shared);
      const result: TrackingSharingResult = { adf_id: adfId, tracking_shared: shared };
      return reply.send(result);
    },
  );
}
