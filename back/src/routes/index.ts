import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { Permission } from "../permissions.js";
import type { ApiHandler } from "../types.js";
import {
  ADF_FROM_BODY,
  requireAdfScope,
  requireAuth,
  requirePermission,
  type AdfSource,
} from "../plugins/authorize.js";
import { toFastifyHandler } from "../plugins/legacy.js";

import { registerAdfBoundaryRoutes } from "./adfBoundaries.js";
import { registerAdfDetailRoutes } from "./adfDetail.js";
import { registerAdfRoutes } from "./adfs.js";
import { registerAppConfigRoutes } from "./appConfig.js";
import { registerBoundaryRoutes } from "./boundary.js";
import { registerHealthRoutes } from "./health.js";
import { registerHidrantRoutes } from "./hidrants.js";
import { registerIncidenciaRoutes } from "./incidencies.js";
import { registerOverpassRoutes } from "./overpass.js";
import { registerRoutingRoutes } from "./route.js";
import { registerTelegramNotificationRoutes } from "./sendToTelegram.js";
import { registerTelegramRoutes } from "./telegram.js";
import { registerTelegramWebhookRoutes } from "./telegramWebhook.js";
import { registerTrackingSharingRoutes } from "./trackingSharing.js";
import { registerUserRoutes } from "./users.js";

// Encara a l'adapter antic (usen cookies de sessió, SSE o capçaleres de fitxer).
import { login, me, logout, changePassword } from "./auth.js";
import access from "./access.js";
import tracking from "./tracking.js";
import osm from "./osm.js";

/**
 * Registre de totes les rutes de l'API.
 *
 * Les rutes natives (hidrants, incidències, ADFs, usuaris, Telegram, salut...)
 * viuen al seu mòdul amb el seu esquema Zod i els seus `preHandler`.
 *
 * Les que encara passen per l'adapter antic es declaren a la taula de sota, amb
 * `auth`, `permission`, `adfScope` i `guards` igualment explícits: l'adapter
 * només tradueix `req`/`res`, no autoritza.
 */

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

interface RouteDefinition {
  method: Method | Method[];
  path: string;
  handler: ApiHandler;
  /** Exigeix sessió. Les mutacions sempre l'han d'exigir. */
  auth?: boolean;
  /** Capacitat requerida (implica sessió). */
  permission?: Permission;
  /** Només es pot mutar la pròpia ADF (l'admin té abast global). */
  adfScope?: readonly AdfSource[];
}

const legacyRoutes: RouteDefinition[] = [
  // --- Autenticació (cookies de sessió: `_userToSign` / `_clearCookie`) ---
  { method: "POST", path: "/api/auth/login", handler: login },
  { method: "POST", path: "/api/auth/logout", handler: logout },
  { method: "GET", path: "/api/auth/me", handler: me },
  { method: "PUT", path: "/api/auth/password", handler: changePassword, auth: true },
  { method: ["GET", "POST"], path: "/api/auth/access/:token", handler: access },

  // --- Tracking (el stream fa servir `_reply` per fer SSE) ---
  { method: "GET", path: "/api/tracking/status", handler: tracking.status, auth: true },
  { method: "GET", path: "/api/tracking/positions", handler: tracking.positions, auth: true },
  { method: "GET", path: "/api/tracking/stream", handler: tracking.stream, auth: true },
  { method: "POST", path: "/api/tracking/enable", handler: tracking.enable, auth: true },
  { method: "GET", path: "/api/tracking/config", handler: tracking.config, auth: true },

  // --- OSM: consultar l'estat només demana veure'l; publicar demana sync_osm ---
  {
    method: "GET",
    path: "/api/osm/status",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "GET",
    path: "/api/osm/pending",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "GET",
    path: "/api/osm/conflicts",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "GET",
    path: "/api/osm/conflicts/osc",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "GET",
    path: "/api/osm/reviews",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "GET",
    path: "/api/osm/diff/:id",
    handler: osm,
    auth: true,
    permission: "view_sync_status",
  },
  {
    method: "POST",
    path: "/api/osm/push-sync",
    handler: osm,
    auth: true,
    permission: "sync_osm",
    adfScope: ADF_FROM_BODY,
  },
  {
    method: "POST",
    path: "/api/osm/push-selected",
    handler: osm,
    auth: true,
    permission: "sync_osm",
  },
  {
    method: "POST",
    path: "/api/osm/discard-selected",
    handler: osm,
    auth: true,
    permission: "sync_osm",
  },
  {
    method: "POST",
    path: "/api/osm/conflicts/resolve",
    handler: osm,
    auth: true,
    permission: "sync_osm",
  },
  {
    method: "POST",
    path: "/api/osm/missing/purge",
    handler: osm,
    auth: true,
    permission: "sync_osm",
    adfScope: ADF_FROM_BODY,
  },
  {
    method: "POST",
    path: "/api/osm/pull-hydrant",
    handler: osm,
    auth: true,
    permission: "sync_osm",
  },
];

function guardsFor(route: RouteDefinition): Guard[] {
  const guards: Guard[] = [];

  if (route.auth || route.permission) {
    guards.push(requireAuth);
  }
  if (route.permission) {
    guards.push(requirePermission(route.permission));
  }
  if (route.adfScope) {
    guards.push(requireAdfScope(route.adfScope));
  }

  return guards;
}

function registerLegacyRoutes(app: FastifyInstance): void {
  for (const route of legacyRoutes) {
    app.route({
      method: route.method,
      url: route.path,
      preHandler: guardsFor(route),
      handler: toFastifyHandler(app, route.handler),
    });
  }
}

export function registerRoutes(app: FastifyInstance): void {
  // Rutes natives: esquema Zod a la frontera i auth/permís declarats per ruta.
  registerHealthRoutes(app);
  registerAppConfigRoutes(app);
  registerAdfDetailRoutes(app);
  registerBoundaryRoutes(app);
  registerAdfRoutes(app);
  registerAdfBoundaryRoutes(app);
  registerTrackingSharingRoutes(app);
  registerUserRoutes(app);
  registerTelegramRoutes(app);
  registerTelegramWebhookRoutes(app);
  registerOverpassRoutes(app);
  registerRoutingRoutes(app);
  registerTelegramNotificationRoutes(app);
  registerHidrantRoutes(app);
  registerIncidenciaRoutes(app);

  // Les que encara passen per l'adapter antic.
  registerLegacyRoutes(app);
}
