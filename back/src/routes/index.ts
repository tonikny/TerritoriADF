import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiHandler } from "../types.js";
import type { Permission } from "../permissions.js";
import {
  ADF_FROM_BODY,
  requireAdfScope,
  requireAuth,
  requireBodyRolePermission,
  requireComputedPermission,
  requirePermission,
  requireTargetUserScope,
  requireUsernameAdfScope,
  type AdfSource,
} from "../plugins/authorize.js";
import { toFastifyHandler } from "../plugins/legacy.js";

import overpass from "./overpass.js";
import sendToTelegram, { notificationPermission } from "./sendToTelegram.js";
import routing from "./route.js";
import municipi from "./municipi.js";
import {
  create as adfsCreate,
  detail as adfsDetail,
  list as adfsList,
  remove as adfsDelete,
  update as adfsUpdate,
} from "./municipis.js";
import adfBoundaries from "./adfBoundaries.js";
import boundary from "./boundary.js";
import { login, me, logout, changePassword } from "./auth.js";
import access from "./access.js";
import {
  accessLink as userAccessLink,
  create as usersCreate,
  list as usersList,
  remove as usersDelete,
  update as usersUpdate,
} from "./users.js";
import tracking from "./tracking.js";
import trackingSharing from "./trackingSharing.js";
import telegram from "./telegram.js";
import telegramWebhook from "./telegramWebhook.js";
import osm from "./osm.js";
import appConfig from "./appConfig.js";
import { healthz, readyz } from "./health.js";

/**
 * Taula de rutes que encara fan servir l'adapter antic.
 *
 * Cada entrada declara **explícitament** el mètode, si cal sessió, quina
 * capacitat de `permissions.ts` s'exigeix, d'on surt l'ADF i, si cal, guards
 * addicionals per a regles que depenen de les dades (l'usuari objectiu, el rol
 * demanat al cos...). Els handlers no repeteixen cap comprovació de rol.
 *
 * Les rutes d'hidrants i incidències ja són natives (`routes/hidrants.ts`,
 * `routes/incidencies.ts`) i no són aquí.
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
  /** Guards addicionals, declarats aquí i no dins del handler. */
  guards?: readonly Guard[];
}

const routes: RouteDefinition[] = [
  // --- Salut ---
  { method: "GET", path: "/healthz", handler: healthz },
  { method: "GET", path: "/readyz", handler: readyz },

  // --- Autenticació ---
  { method: "POST", path: "/api/auth/login", handler: login },
  { method: "POST", path: "/api/auth/logout", handler: logout },
  { method: "GET", path: "/api/auth/me", handler: me },
  { method: "PUT", path: "/api/auth/password", handler: changePassword, auth: true },
  { method: ["GET", "POST"], path: "/api/auth/access/:token", handler: access },

  // --- Configuració pública (matriu de permisos inclosa) ---
  { method: "GET", path: "/api/config", handler: appConfig },

  // --- Serveis externs ---
  {
    method: "POST",
    path: "/api/overpass",
    handler: overpass,
    auth: true,
  },
  {
    method: "POST",
    path: "/api/sendToTelegram",
    handler: sendToTelegram,
    auth: true,
    adfScope: ADF_FROM_BODY,
    // El permís depèn de l'acció notificada (create/edit/delete_hydrant).
    guards: [requireComputedPermission((request) => notificationPermission(request.body))],
  },
  { method: "GET", path: "/api/route", handler: routing, auth: true },

  // --- ADFs: lectura pública; crear, modificar i recalcular límits és d'admin ---
  { method: "GET", path: "/api/adf", handler: municipi },
  { method: "GET", path: "/api/adf/boundary", handler: boundary },
  { method: "GET", path: "/api/adfs", handler: adfsList },
  { method: "POST", path: "/api/adfs", handler: adfsCreate, auth: true, permission: "manage_adfs" },
  { method: "GET", path: "/api/adfs/:id", handler: adfsDetail },
  {
    method: "PUT",
    path: "/api/adfs/:id",
    handler: adfsUpdate,
    auth: true,
    permission: "manage_adfs",
  },
  {
    method: "DELETE",
    path: "/api/adfs/:id",
    handler: adfsDelete,
    auth: true,
    permission: "manage_adfs",
  },
  {
    method: "POST",
    path: "/api/adfs/:id/boundaries",
    handler: adfBoundaries,
    auth: true,
    permission: "manage_adfs",
  },
  {
    method: "PUT",
    path: "/api/adfs/:id/tracking-sharing",
    handler: trackingSharing,
    auth: true,
    permission: "manage_own_adf_sharing",
    adfScope: [{ from: "params", key: "id" }],
  },

  // --- Tracking ---
  { method: "GET", path: "/api/tracking/status", handler: tracking.status, auth: true },
  { method: "GET", path: "/api/tracking/positions", handler: tracking.positions, auth: true },
  { method: "GET", path: "/api/tracking/stream", handler: tracking.stream, auth: true },
  { method: "POST", path: "/api/tracking/enable", handler: tracking.enable, auth: true },
  { method: "GET", path: "/api/tracking/config", handler: tracking.config, auth: true },

  // --- Telegram per ADF (l'abast es resol amb l'id de la ruta) ---
  {
    method: "POST",
    path: "/api/adfs/:id/telegram",
    handler: telegram.register,
    auth: true,
    permission: "manage_telegram",
    adfScope: [{ from: "params", key: "id" }],
  },
  {
    method: "DELETE",
    path: "/api/adfs/:id/telegram",
    handler: telegram.unlink,
    auth: true,
    permission: "manage_telegram",
    adfScope: [{ from: "params", key: "id" }],
  },
  {
    method: "GET",
    path: "/api/adfs/:id/telegram/status",
    handler: telegram.status,
    auth: true,
    permission: "manage_telegram",
    adfScope: [{ from: "params", key: "id" }],
  },
  {
    method: "POST",
    path: "/api/adfs/:id/telegram/link",
    handler: telegram.link,
    auth: true,
    permission: "manage_telegram",
    adfScope: [{ from: "params", key: "id" }],
  },
  {
    method: "POST",
    path: "/api/adfs/:id/telegram/test",
    handler: telegram.test,
    auth: true,
    permission: "manage_telegram",
    adfScope: [{ from: "params", key: "id" }],
  },
  { method: "POST", path: "/api/telegram/webhook/:secret", handler: telegramWebhook },

  // --- Usuaris: `manage_users` (admin i coordinador) + abast declarat per guard ---
  { method: "GET", path: "/api/users", handler: usersList, auth: true, permission: "manage_users" },
  {
    method: "POST",
    path: "/api/users",
    handler: usersCreate,
    auth: true,
    permission: "manage_users",
    // L'ADF del username ha de ser la pròpia i el rol `admin` demana manage_all_users.
    guards: [requireUsernameAdfScope, requireBodyRolePermission("manage_all_users")],
  },
  {
    method: "PUT",
    path: "/api/users/:id",
    handler: usersUpdate,
    auth: true,
    permission: "manage_users",
    guards: [
      requireTargetUserScope({ denySelf: true }),
      requireUsernameAdfScope,
      requireBodyRolePermission("manage_all_users"),
    ],
  },
  {
    method: "DELETE",
    path: "/api/users/:id",
    handler: usersDelete,
    auth: true,
    permission: "manage_users",
    guards: [requireTargetUserScope({ denySelf: true })],
  },
  {
    method: "POST",
    path: "/api/users/:id/access-link",
    handler: userAccessLink,
    auth: true,
    permission: "manage_users",
    guards: [requireTargetUserScope()],
  },

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
  if (route.guards) {
    guards.push(...route.guards);
  }

  return guards;
}

export function registerLegacyRoutes(app: FastifyInstance): void {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.path,
      preHandler: guardsFor(route),
      handler: toFastifyHandler(app, route.handler),
    });
  }
}
