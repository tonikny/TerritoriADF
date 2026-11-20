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
 * Les rutes que encara passen per l'adapter antic no declaren esquema i, per
 * tant, no hi surten: la cobertura creix a mesura que es migren.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: `${APP_NAME} API`,
        description:
          "API d'hidrants, incidències, OSM i tracking. Només les rutes amb esquema Zod hi apareixen.",
        version: "1.0.0",
      },
      tags: [
        { name: "hidrants", description: "Hidrants (lectura pública, mutacions amb permís)" },
        { name: "incidencies", description: "Incidències i el seu historial d'esdeveniments" },
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
