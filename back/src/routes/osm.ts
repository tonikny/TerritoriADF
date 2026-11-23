import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { HidrantsRepository } from "../db/repositories/hidrantsRepository.js";
import { BadRequestError } from "../errors.js";
import {
  ADF_FROM_BODY,
  requireAdfScope,
  requireAuth,
  requirePermission,
} from "../plugins/authorize.js";
import { isConfigured } from "../services/osmApi.js";
import {
  generateOscFile,
  getConflicts,
  resolveAfterJOSM,
} from "../services/osmConflictResolver.js";
import { pushSyncToOSM } from "../services/osmPushSync.js";
import type { HidrantSyncConflict, HidrantSyncIssue } from "@territoriadf/contracts/hidrants";
import type {
  OsmDiff,
  OsmDiscardResult,
  OsmPendingResponse,
  OsmPurgeResult,
} from "@territoriadf/contracts/osm";

/** Cos d'ADF opcional: `adf_id` pot arribar com a número o com a text. */
const adfIdValue = z.union([z.number(), z.string()]).optional();

const adfBodySchema = z.object({ adf_id: adfIdValue }).optional();
const idsBodySchema = z.object({ ids: z.array(z.string()).optional() }).optional();
const idBodySchema = z.object({ id: z.string().optional() }).optional();
const pendingQuerySchema = z.object({ adf: z.coerce.number().int().positive().optional() });
const idParamsSchema = z.object({ id: z.string() });
const purgeBodySchema = z
  .object({ adf_id: adfIdValue, ids: z.array(z.string()).optional() })
  .optional();

/** Consultar l'estat només demana veure'l; publicar demana `sync_osm`. */
const VIEW_SYNC = [requireAuth, requirePermission("view_sync_status")];
const MANAGE_SYNC = [requireAuth, requirePermission("sync_osm")];
const MANAGE_SYNC_OWN_ADF = [
  requireAuth,
  requirePermission("sync_osm"),
  requireAdfScope(ADF_FROM_BODY),
];

/** Converteix `adf_id` (número o text) al número que esperen els serveis. */
function adfIdFromBody(value: number | string | undefined): number | undefined {
  return value ? Number(value) : undefined;
}

export function registerOsmRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /** GET /api/osm/status → estat del token i comptador de conflictes. */
  typed.get(
    "/api/osm/status",
    {
      preHandler: VIEW_SYNC,
      schema: { tags: ["osm"], summary: "Estat de la sincronització amb OSM" },
    },
    async (_request, reply) => {
      const configured = isConfigured();
      const conflicts = HidrantsRepository.findConflicts();
      const stats = HidrantsRepository.getSyncStats(0); // global
      return reply.send({ configured, conflictCount: conflicts.length, stats });
    },
  );

  /** GET /api/osm/pending?adf=ID → canvis pendents per ADF. */
  typed.get(
    "/api/osm/pending",
    {
      preHandler: VIEW_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Canvis pendents per ADF",
        querystring: pendingQuerySchema,
      },
    },
    async (request, reply) => {
      const adfId = request.query.adf;
      if (!adfId) {
        throw new BadRequestError("Cal especificar l'ADF amb ?adf=ID");
      }
      const pending = HidrantsRepository.findByAdfWithDetails(adfId);
      const stats = HidrantsRepository.getSyncStats(adfId);
      const body: OsmPendingResponse = { pending, stats };
      return reply.send(body);
    },
  );

  /** POST /api/osm/push-sync → pujar tots els canvis pendents a OSM. */
  typed.post(
    "/api/osm/push-sync",
    {
      preHandler: MANAGE_SYNC_OWN_ADF,
      schema: {
        tags: ["osm"],
        summary: "Puja tots els canvis pendents a OSM",
        body: adfBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFromBody(request.body?.adf_id);
      request.log
        .child({ module: "osm", operation: "pushSync" })
        .info({ adfId }, "Iniciant push sync global");
      const result = await pushSyncToOSM(adfId ? { adfId } : undefined);
      request.log
        .child({ module: "osm", operation: "pushSync" })
        .info({ result }, "Push sync completat");
      return reply.send(result);
    },
  );

  /** POST /api/osm/push-selected → pujar només els hidrants seleccionats. */
  typed.post(
    "/api/osm/push-selected",
    {
      preHandler: MANAGE_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Puja els hidrants seleccionats a OSM",
        body: idsBodySchema,
      },
    },
    async (request, reply) => {
      const ids = request.body?.ids;
      if (!ids || ids.length === 0) {
        throw new BadRequestError("Cal especificar els IDs a pujar");
      }
      request.log
        .child({ module: "osm", operation: "pushSelected" })
        .info({ count: ids.length, firstIds: ids.slice(0, 3) }, "Iniciant push sync seleccionat");
      const result = await pushSyncToOSM({ ids });
      request.log
        .child({ module: "osm", operation: "pushSelected" })
        .info({ result }, "Push sync seleccionat completat");
      return reply.send(result);
    },
  );

  /** POST /api/osm/discard-selected → descartar canvis seleccionats. */
  typed.post(
    "/api/osm/discard-selected",
    {
      preHandler: MANAGE_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Descarta els canvis locals seleccionats",
        body: idsBodySchema,
      },
    },
    async (request, reply) => {
      const ids = request.body?.ids;
      if (!ids || ids.length === 0) {
        throw new BadRequestError("Cal especificar els IDs a descartar");
      }
      const log = request.log.child({ module: "osm", operation: "discardSelected" });
      log.info({ count: ids.length, firstIds: ids.slice(0, 3) }, "Descartant canvis seleccionats");

      // Els PENDING_CREATE mai han existit a OSM → esborrar-los de la BD
      // La resta → marcar SYNCED (els canvis locals es descarten, OSM és la referència)
      const hydrantsToDiscard = HidrantsRepository.findByIds(ids);
      const toDelete = hydrantsToDiscard
        .filter((h) => h.sync_status === "PENDING_CREATE")
        .map((h) => h.id);
      const toSync = hydrantsToDiscard
        .filter((h) => h.sync_status !== "PENDING_CREATE")
        .map((h) => h.id);

      log.info({ toDelete: toDelete.length, toSync: toSync.length }, "Estadístiques descartament");

      if (toDelete.length > 0) {
        HidrantsRepository.deleteMany(toDelete);
        log.info({ count: toDelete.length }, "Hidrants esborrats de BD (mai publicats)");
      }
      if (toSync.length > 0) {
        // Restaurar les etiquetes d'OSM des de remote_osm_tags abans de marcar com a sincronitzat
        const now = new Date().toISOString();
        let restoredCount = 0;
        for (const hydrantId of toSync) {
          const hydrant = hydrantsToDiscard.find((h) => h.id === hydrantId);
          if (hydrant && hydrant.remote_osm_tags && hydrant.adf_id !== null) {
            HidrantsRepository.restoreRemoteTags(hydrantId, hydrant.remote_osm_tags, now);
            restoredCount++;
          }
        }
        log.info(
          { restored: restoredCount, reverted: toSync.length - restoredCount },
          "Canvis locals descartats",
        );
      }

      const body: OsmDiscardResult = { discarded: toSync.length, deleted: toDelete.length };
      return reply.send(body);
    },
  );

  /** GET /api/osm/conflicts → llistat de conflictes amb detalls. */
  typed.get(
    "/api/osm/conflicts",
    {
      preHandler: VIEW_SYNC,
      schema: { tags: ["osm"], summary: "Llista de conflictes amb OSM" },
    },
    async (request, reply) => {
      const conflicts = getConflicts();
      request.log
        .child({ module: "osm", operation: "listConflicts" })
        .info({ count: conflicts.length }, "Llistant conflictes");
      return reply.send(conflicts);
    },
  );

  /** GET /api/osm/conflicts/osc → descarregar .osc únic amb tots els conflictes. */
  typed.get(
    "/api/osm/conflicts/osc",
    {
      preHandler: VIEW_SYNC,
      schema: { tags: ["osm"], summary: "Descarrega els conflictes en .osc" },
    },
    async (_request, reply) => {
      const osc = generateOscFile();
      if (!osc) {
        return reply.send({ message: "No hi ha conflictes per exportar" });
      }
      return reply
        .header("Content-Type", "application/xml")
        .header("Content-Disposition", 'attachment; filename="conflictes_osc.osc"')
        .send(osc);
    },
  );

  /** POST /api/osm/conflicts/resolve → resoldre un conflicte després de JOSM. */
  typed.post(
    "/api/osm/conflicts/resolve",
    {
      preHandler: MANAGE_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Resol un conflicte després de JOSM",
        body: idBodySchema,
      },
    },
    async (request, reply) => {
      const id = request.body?.id;
      if (!id) {
        throw new BadRequestError("Cal especificar l'id del conflicte");
      }
      const resolved = await resolveAfterJOSM(id);
      return reply.send({ resolved });
    },
  );

  /** GET /api/osm/reviews → hidrants amb dades per revisar abans de pujar. */
  typed.get(
    "/api/osm/reviews",
    {
      preHandler: VIEW_SYNC,
      schema: { tags: ["osm"], summary: "Hidrants pendents de revisió" },
    },
    async (_request, reply) => {
      const reviews = HidrantsRepository.findByReview();
      const formatted = reviews.map((h) => ({
        id: h.id,
        osm_id: h.osm_id,
        lat: h.lat,
        lon: h.lon,
        sync_error: h.sync_error ? (JSON.parse(h.sync_error) as HidrantSyncIssue[]) : [],
      }));
      return reply.send({ reviews: formatted, count: formatted.length });
    },
  );

  /** POST /api/osm/missing/purge → esborrar els hidrants que ja no són a OSM. */
  typed.post(
    "/api/osm/missing/purge",
    {
      preHandler: MANAGE_SYNC_OWN_ADF,
      schema: {
        tags: ["osm"],
        summary: "Purga els hidrants que ja no són a OSM",
        body: purgeBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = adfIdFromBody(request.body?.adf_id);
      const ids = request.body?.ids && request.body.ids.length > 0 ? request.body.ids : undefined;
      if (!adfId && !ids) {
        throw new BadRequestError("Cal especificar adf_id o els ids a esborrar");
      }
      const deleted = HidrantsRepository.purgeMissingInOsm({ adfId, ids });
      request.log
        .child({ module: "osm", operation: "purgeMissing" })
        .info({ adfId, ids: ids?.length, deleted }, "Hidrants que ja no són a OSM esborrats");
      const body: OsmPurgeResult = { deleted };
      return reply.send(body);
    },
  );

  /** POST /api/osm/pull-hydrant → aplicar la versió d'OSM a un hidrant individual. */
  typed.post(
    "/api/osm/pull-hydrant",
    {
      preHandler: MANAGE_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Baixa un hidrant d'OSM i resol el conflicte",
        body: idBodySchema,
      },
    },
    async (request, reply) => {
      const id = request.body?.id;
      if (!id) {
        throw new BadRequestError("Cal especificar l'id del hidrant");
      }
      const log = request.log.child({ module: "osm", operation: "pullHydrant" });
      log.info({ id }, "Baixant hidrant individual d'OSM");

      const hydrant = HidrantsRepository.findByIds([id])[0];
      if (!hydrant) {
        log.error({ id }, "Hidrant no trobat");
        throw new BadRequestError("Hidrant no trobat");
      }
      if (!hydrant.osm_id) {
        log.error({ id }, "Hidrant sense osm_id");
        throw new BadRequestError("L'hidrant no té osm_id associat");
      }

      // Descarregar node des d'OSM
      const { queryOverpass } = await import("../services/overpass.js");
      const result = await queryOverpass(`[out:json];node(${hydrant.osm_id});out body;`);
      const osmNode = result.ok ? result.data.elements?.[0] : undefined;
      if (!osmNode) {
        log.error({ osm_id: hydrant.osm_id }, "Error baixant node d'OSM");
        throw new BadRequestError(`No s'ha pogut obtenir el node ${hydrant.osm_id} d'OSM`);
      }
      log.info(
        { osmVersion: osmNode.version, localVersion: hydrant.osm_version },
        "Hidrant descarregat d'OSM",
      );

      HidrantsRepository.resolveConflict(hydrant.id, {
        osmVersion: osmNode.version,
        lat: osmNode.lat,
        lon: osmNode.lon,
        osmTags: JSON.stringify(osmNode.tags || {}),
      });

      log.info({ id, osmVersion: osmNode.version }, "Conflicte resolt (baixat OSM)");
      return reply.send({ success: true });
    },
  );

  /** GET /api/osm/diff/:id → diff local vs OSM per un hidrant. */
  typed.get(
    "/api/osm/diff/:id",
    {
      preHandler: VIEW_SYNC,
      schema: {
        tags: ["osm"],
        summary: "Diff local vs OSM d'un hidrant",
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const hydrant = HidrantsRepository.findByIds([request.params.id])[0];
      if (!hydrant) {
        throw new BadRequestError("Hidrant no trobat");
      }
      if (!hydrant.osm_id) {
        return reply.send({ diff: null });
      }

      // Si CONFLICT amb sync_error pre-computat, reutilitzar
      if (hydrant.sync_status === "CONFLICT" && hydrant.sync_error) {
        try {
          const errData = JSON.parse(hydrant.sync_error) as HidrantSyncConflict;
          if (errData.osmTags && errData.localTags) {
            const diff: OsmDiff = {
              osmTags: errData.localTags,
              remoteOsmTags: errData.osmTags,
              localLat: errData.localLat ?? hydrant.lat,
              localLon: errData.localLon ?? hydrant.lon,
              remoteLat: errData.osmLat,
              remoteLon: errData.osmLon,
            };
            return reply.send({ diff });
          }
        } catch {
          /* ignore parse error */
        }
      }

      // Si tenim dades remotes guardades (PENDING_UPDATE, ERROR, REVIEW, etc.)
      if (hydrant.remote_osm_tags) {
        const osmTags = (hydrant.osm_tags ? JSON.parse(hydrant.osm_tags) : {}) as Record<
          string,
          string
        >;
        const remoteOsmTags = JSON.parse(hydrant.remote_osm_tags) as Record<string, string>;
        const diff: OsmDiff = {
          osmTags,
          remoteOsmTags,
          localLat: hydrant.lat,
          localLon: hydrant.lon,
          remoteLat: hydrant.remote_lat ?? hydrant.lat,
          remoteLon: hydrant.remote_lon ?? hydrant.lon,
        };
        return reply.send({ diff });
      }

      return reply.send({ diff: null });
    },
  );
}
