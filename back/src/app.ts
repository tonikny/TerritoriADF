import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler, registerNotFound } from "./plugins/errors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerRoutes } from "./routes/index.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";

/**
 * Fàbrica de l'aplicació: munta plugins, guards i rutes i retorna la instància
 * de Fastify **sense escoltar cap port**. Qui arrenca el servei és `server.ts`
 * (o un test, que pot fer `app.inject()` directament).
 *
 * Orde: primer els compiladors d'esquema i l'autenticació (les rutes en
 * depenen), després l'error handler, l'OpenAPI i les rutes.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    // `FastifyBaseLogger` explícit: la instància queda tipada amb el logger de
    // Fastify (no amb el `Logger` concret de pino) i es pot passar a qualsevol
    // plugin que rebi `FastifyInstance`.
    loggerInstance: logger.child({ module: "server", operation: "api" }) as FastifyBaseLogger,
    // Darrere d'un proxy invers, X-Forwarded-For és la IP real (necessari per als
    // límits de login). Desactivat per defecte: només s'activa amb TRUST_PROXY=true.
    trustProxy: config.TRUST_PROXY,
  });

  if (process.env.NODE_ENV === "production" && !config.TRUST_PROXY) {
    logger.warn(
      "TRUST_PROXY=false en producció: el límit de login per IP queda desactivat; activa'l darrere de nginx",
    );
  }

  // Validació i serialització amb els esquemes Zod de cada ruta.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onRequest", (request, _reply, done) => {
    request.log = request.log.child({ module: "http", operation: request.url.split("?")[0] });
    done();
  });

  await registerAuth(app);
  registerErrorHandler(app);
  await registerOpenApi(app);

  // Totes les rutes són natives: esquema Zod i `preHandler` (sessió, permís i
  // abast d'ADF) declarats al costat del handler.
  registerRoutes(app);

  registerNotFound(app);

  return app;
}
