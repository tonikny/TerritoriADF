import { randomUUID } from "node:crypto";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";

import { registerAuth } from "./plugins/auth.js";
import { registerErrorHandler, registerNotFound } from "./plugins/errors.js";
import { registerOpenApi } from "./plugins/openapi.js";
import { registerRoutes } from "./routes/index.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";

/** Capçalera per on viatja l'ID de la petició, d'entrada i de sortida. */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Només s'accepta un ID extern si és curt i d'un alfabet innocu: el valor acaba
 * al log, i una capçalera lliure hi podria injectar línies o inflar-lo.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

function requestIdFromHeader(header: string | string[] | undefined): string | null {
  const raw = Array.isArray(header) ? header[0] : header;
  const candidate = raw?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : null;
}

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
    // L'ID de petició és el fil que uneix client, resposta i log: si el client (o
    // un proxy) n'envia un de vàlid, es respecta; si no, se'n genera un d'únic.
    genReqId: (req) => requestIdFromHeader(req.headers[REQUEST_ID_HEADER]) ?? randomUUID(),
  });

  if (process.env.NODE_ENV === "production" && !config.TRUST_PROXY) {
    logger.warn(
      "TRUST_PROXY=false en producció: el límit de login per IP queda desactivat; activa'l darrere de nginx",
    );
  }

  // Validació i serialització amb els esquemes Zod de cada ruta.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook("onRequest", (request, reply, done) => {
    request.log = request.log.child({ module: "http", operation: request.url.split("?")[0] });
    // El mateix ID torna al client a totes les respostes (també a les d'èxit),
    // perquè qualsevol incidència es pugui creuar amb el log del backend.
    reply.header(REQUEST_ID_HEADER, request.id);
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
