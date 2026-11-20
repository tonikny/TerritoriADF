import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { requireAuth } from "../plugins/authorize.js";
import { config } from "../utils/config.js";

const COORD_RE = /^-?\d{1,3}(\.\d{1,7})?,-?\d{1,3}(\.\d{1,7})?$/;

function parseLatLon(value: unknown): { lat: number; lon: number } | null {
  if (typeof value !== "string" || !COORD_RE.test(value.trim())) {
    return null;
  }
  const [latStr, lonStr] = value.trim().split(",");
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

const querySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

/** GET /api/route?from=lat,lon&to=lat,lon: ruta òptima via GraphHopper. */
export function registerRoutingRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/route",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["routing"],
        summary: "Calcula una ruta en cotxe entre dos punts (GraphHopper)",
        querystring: querySchema,
      },
    },
    async (request, reply) => {
      const log = request.log.child({ module: "routing", operation: "graphHopper" });

      try {
        const from = parseLatLon(request.query.from);
        const to = parseLatLon(request.query.to);

        if (!from || !to) {
          return reply
            .code(400)
            .send({ error: "Paràmetres 'from' i 'to' obligatoris en format lat,lon" });
        }

        const apiKey = config.GRAPHHOPPER_API_KEY;
        if (!apiKey) {
          log.error("GRAPHHOPPER_API_KEY no configurada");
          return reply.code(503).send({ error: "El servei de rutes no està disponible" });
        }

        const url =
          `https://graphhopper.com/api/1/route?point=${encodeURIComponent(`${from.lat},${from.lon}`)}` +
          `&point=${encodeURIComponent(`${to.lat},${to.lon}`)}` +
          `&vehicle=car&points_encoded=false&locale=en&key=${encodeURIComponent(apiKey)}`;

        log.debug({ from, to }, "Requesting GraphHopper route");

        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) {
          log.warn({ status: r.status }, "GraphHopper upstream error");
          return reply.code(502).send({ error: "No s'ha pogut calcular la ruta" });
        }
        const text = await r.text();

        try {
          return reply.send(JSON.parse(text));
        } catch {
          log.error({ status: r.status }, "GraphHopper response was not JSON");
          return reply.code(502).send({ error: "No s'ha pogut calcular la ruta" });
        }
      } catch (err) {
        log.error({ err }, "Routing error");
        return reply.code(500).send({ error: "Error intern del servidor" });
      }
    },
  );
}
