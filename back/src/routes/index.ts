import type { FastifyInstance } from "fastify";

import { registerAccessRoutes } from "./access.js";
import { registerAdfBoundaryRoutes } from "./adfBoundaries.js";
import { registerAdfDetailRoutes } from "./adfDetail.js";
import { registerAdfRoutes } from "./adfs.js";
import { registerAppConfigRoutes } from "./appConfig.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBoundaryRoutes } from "./boundary.js";
import { registerHealthRoutes } from "./health.js";
import { registerHidrantRoutes } from "./hidrants.js";
import { registerIncidenciaRoutes } from "./incidencies.js";
import { registerOsmRoutes } from "./osm.js";
import { registerOverpassRoutes } from "./overpass.js";
import { registerRoutingRoutes } from "./route.js";
import { registerTelegramNotificationRoutes } from "./sendToTelegram.js";
import { registerTelegramRoutes } from "./telegram.js";
import { registerTelegramWebhookRoutes } from "./telegramWebhook.js";
import { registerTrackingRoutes } from "./tracking.js";
import { registerTrackingSharingRoutes } from "./trackingSharing.js";
import { registerUserRoutes } from "./users.js";

/**
 * Registre de totes les rutes de l'API.
 *
 * Cada mòdul declara les seves rutes amb esquema Zod i, al costat del handler,
 * els `preHandler` que li toquen (sessió, permís i abast d'ADF).
 */
export function registerRoutes(app: FastifyInstance): void {
  registerHealthRoutes(app);
  registerAppConfigRoutes(app);
  registerAuthRoutes(app);
  registerAccessRoutes(app);
  registerAdfDetailRoutes(app);
  registerBoundaryRoutes(app);
  registerAdfRoutes(app);
  registerAdfBoundaryRoutes(app);
  registerTrackingRoutes(app);
  registerTrackingSharingRoutes(app);
  registerUserRoutes(app);
  registerTelegramRoutes(app);
  registerTelegramWebhookRoutes(app);
  registerOverpassRoutes(app);
  registerRoutingRoutes(app);
  registerTelegramNotificationRoutes(app);
  registerOsmRoutes(app);
  registerHidrantRoutes(app);
  registerIncidenciaRoutes(app);
}
