import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { requireAuth } from "../plugins/authorize.js";
import { queryOverpass } from "../services/overpass.js";

/**
 * El proxy és una funcionalitat d'usuaris autenticats (els hidrants públics
 * surten de la BD via GET /api/hidrants, sense passar per Overpass). Exigir
 * sessió evita que un script anònim abusi de la quota d'Overpass amb el
 * nostre User-Agent/contacte. Defensa en profunditat: nginx hi aplica
 * rate-limit + cos màxim.
 */
const MAX_QUERY_LENGTH = 8000;
const QUERY_TIMEOUT_MS = 25000;

export function registerOverpassRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/api/overpass",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["overpass"],
        summary: "Proxy de consultes Overpass (només lectura JSON)",
      },
    },
    async (request, reply) => {
      const log = request.log.child({ module: "overpass", operation: "proxy" });

      const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
      if (!contentType.startsWith("application/json")) {
        return reply.code(415).send({ error: "Content-Type application/json required" });
      }

      try {
        const { query } = (request.body ?? {}) as { query?: unknown };
        if (!query || typeof query !== "string") {
          return reply.code(400).send({ error: "Missing query" });
        }

        const normalized = query.trim().replace(/\r/g, "");
        if (normalized.length < 10 || normalized.length > MAX_QUERY_LENGTH) {
          return reply.code(400).send({ error: "Query no vàlida" });
        }
        // Validació bàsica: només lectura en JSON (el servei fa response.json()).
        // Bloqueja `out:xml/csv`, escriptures i querys buides sense trencar el sync intern
        // (que no passa per aquest endpoint).
        if (!/\[out:json/i.test(normalized)) {
          return reply.code(400).send({ error: "Query no vàlida" });
        }

        // Timeout amb AbortController: el clearTimeout del finally evita que el
        // timer quedi viu després de respondre (no rete l'event loop ni deixa un
        // rebuig tardà com faria un Promise.race amb setTimeout sense netejar).
        // El signal aborta el fetch: no hi ha cap petició òrfena en marxa.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
        timer.unref();
        let result;
        try {
          result = await queryOverpass(normalized, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) {
            log.warn("Overpass proxy timeout");
            return reply.code(504).send({ error: "Error consultant Overpass" });
          }
          throw err;
        } finally {
          clearTimeout(timer);
        }

        if (!result.ok) {
          log.warn({ status: result.status }, "Overpass upstream error");
          return reply
            .code(result.status === 429 ? 429 : 502)
            .send({ error: "Error consultant Overpass" });
        }

        // Overpass retorna JSON
        return reply.send(result.data);
      } catch (err) {
        log.error({ err }, "Overpass proxy error");
        return reply.code(500).send({ error: "Error intern del servidor" });
      }
    },
  );
}
