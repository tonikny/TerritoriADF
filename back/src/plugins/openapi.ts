import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

import { APP_NAME } from "../utils/appInfo.js";

/**
 * OpenAPI generat a partir dels esquemes Zod de les rutes natives: el mateix
 * esquema valida la petició, tipa el handler i documenta l'endpoint.
 *
 * - `GET /api/openapi.json`: document màquina-llegible (també per als agents).
 * - `GET /api/docs`: UI de Swagger.
 *
 * Totes les rutes declaren esquema, així que el document cobreix tota l'API.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: `${APP_NAME} API`,
        description:
          "API d'hidrants, incidències, OSM i tracking. Totes les rutes declaren esquema Zod.",
        version: "1.0.0",
      },
      tags: [
        { name: "health", description: "Salut i preparació del servei" },
        { name: "config", description: "Configuració pública del client" },
        { name: "auth", description: "Sessió, contrasenya i enllaços d'accés" },
        { name: "adfs", description: "ADFs, fronteres i tracking compartit" },
        { name: "hidrants", description: "Hidrants (lectura pública, mutacions amb permís)" },
        { name: "incidencies", description: "Incidències i el seu historial d'esdeveniments" },
        { name: "users", description: "Gestió d'usuaris" },
        { name: "tracking", description: "OwnTracks: estat, posicions i stream SSE" },
        { name: "osm", description: "Sincronització bidireccional amb OpenStreetMap" },
        { name: "overpass", description: "Consultes a l'API Overpass" },
        { name: "routing", description: "Càlcul de rutes (GraphHopper)" },
        { name: "telegram", description: "Bots i notificacions de Telegram" },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/api/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
  });

  // Document en una ruta estable (la UI el serveix a /api/docs/json): així el
  // client del front, els agents i qualsevol eina poden consumir-lo sense
  // dependre de la UI.
  app.get("/api/openapi.json", { schema: { hide: true } }, async () => app.swagger());
}
