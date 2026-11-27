import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  incidenciaEventDadesSchema,
  incidenciaPrecisioSchema,
  incidenciaPrioritatSchema,
  incidenciaVisibilitatSchema,
  tipusEventSchema,
} from "@territoriadf/contracts/incidencies";

import { IncidenciesService } from "../services/incidenciesService.js";
import { BadRequestError } from "../errors.js";
import { appBaseUrl } from "../utils/appUrl.js";
import {
  ADF_FROM_QUERY_OR_BODY,
  requireAdfScope,
  requireAuth,
  requirePermission,
} from "../plugins/authorize.js";

/**
 * Rutes d'incidències amb handlers natius de Fastify i esquemes Zod.
 *
 * El cos de `POST /api/incidencies/:id/events` ja no és `z.any()`: el tipus
 * d'esdeveniment és una unió tancada i `dades` té forma (amb espai per a camps
 * addicionals dels tipus que encara no s'han formalitzat).
 */

const adfQuerySchema = z.object({
  adf: z.coerce.number().int().positive().optional(),
  incloure_tancades: z.enum(["true", "false"]).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const createBodySchema = z.object({
  adf_id: z.coerce.number().int().positive().optional(),
  titol: z.string(),
  tipus: z.string(),
  prioritat: incidenciaPrioritatSchema.optional(),
  visibilitat: incidenciaVisibilitatSchema.optional(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  precisio: incidenciaPrecisioSchema.optional(),
  comentari: z.string().optional(),
});

const eventBodySchema = z.object({
  tipus_event: tipusEventSchema,
  // L'esquema compartit valida el cos i és el mateix tipus que la columna
  // `incidencia_events.dades` (`catchall` per als camps encara no formalitzats).
  dades: incidenciaEventDadesSchema,
});

export function registerIncidenciaRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // --- GET /api/incidencies: llistar incidències (GeoJSON) ---
  // Públic: l'anonimat només veu les incidències PUBLICA (filtre al repositori).
  typed.get(
    "/api/incidencies",
    {
      schema: {
        tags: ["incidencies"],
        summary: "Incidències d'una ADF en GeoJSON (visibilitat segons sessió)",
        querystring: adfQuerySchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser;
      const isAdmin = user?.role === "admin";
      const adfId = request.query.adf ?? user?.adf_id ?? undefined;

      if (!isAdmin && !adfId) {
        throw new BadRequestError("No s'ha pogut identificar l'ADF", "ADF_NOT_IDENTIFIED");
      }

      const includeClosed = request.query.incloure_tancades === "true";
      const queryAdf = !adfId && isAdmin ? undefined : adfId;
      const viewer = user ? { role: user.role, adf_id: user.adf_id } : null;

      return reply.send(
        await IncidenciesService.getIncidenciesGeoJson(queryAdf, includeClosed, viewer),
      );
    },
  );

  // --- GET /api/incidencies/:id: detall d'una incidència ---
  typed.get(
    "/api/incidencies/:id",
    {
      schema: {
        tags: ["incidencies"],
        summary: "Detall d'una incidència amb el seu historial",
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser;
      const viewer = user ? { role: user.role, adf_id: user.adf_id } : null;
      return reply.send(await IncidenciesService.getIncidenciaById(request.params.id, viewer));
    },
  );

  // --- GET /api/incidencies/:id/events: historial (compatibilitat) ---
  // El front demana el detall per `/api/incidencies/:id`; es manté aquest path
  // amb la mateixa resposta per no trencar clients antics.
  typed.get(
    "/api/incidencies/:id/events",
    {
      schema: {
        tags: ["incidencies"],
        summary: "Historial d'una incidència (equivalent al detall)",
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser;
      const viewer = user ? { role: user.role, adf_id: user.adf_id } : null;
      return reply.send(await IncidenciesService.getIncidenciaById(request.params.id, viewer));
    },
  );

  // --- POST /api/incidencies: crear incidència ---
  typed.post(
    "/api/incidencies",
    {
      preHandler: [
        requireAuth,
        requirePermission("create_incidencia"),
        requireAdfScope(ADF_FROM_QUERY_OR_BODY),
      ],
      schema: {
        tags: ["incidencies"],
        summary: "Crea una incidència (visibilitat inicial segons el rol)",
        querystring: adfQuerySchema,
        body: createBodySchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const adfId = request.query.adf ?? request.body.adf_id ?? user.adf_id ?? undefined;

      if (!adfId) {
        throw new BadRequestError("No s'ha pogut identificar l'ADF", "ADF_NOT_IDENTIFIED");
      }

      const result = IncidenciesService.createIncidencia({
        ...request.body,
        adf_id: adfId,
        usuari_id: user.id,
        nom_usuari: user.username,
        rol_usuari: user.role,
        clientBaseUrl: appBaseUrl(request),
      });

      return reply.code(201).send(result);
    },
  );

  // --- POST /api/incidencies/:id/events: afegir esdeveniment ---
  typed.post(
    "/api/incidencies/:id/events",
    {
      preHandler: [requireAuth, requirePermission("create_incidencia")],
      schema: {
        tags: ["incidencies"],
        summary: "Afegeix un esdeveniment a la incidència",
        params: idParamsSchema,
        body: eventBodySchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const result = IncidenciesService.addEvent(
        request.params.id,
        user,
        request.body.tipus_event,
        request.body.dades,
        appBaseUrl(request),
      );
      return reply.code(201).send(result);
    },
  );
}
