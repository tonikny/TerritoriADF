import type { FastifyError, FastifyInstance } from "fastify";

import { AppError } from "../errors.js";

const KNOWN_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Un únic punt de traducció error → resposta HTTP:
 * - `AppError` (domini) conserva el seu codi.
 * - Els errors de validació d'esquema (Zod o JSON Schema) són sempre 400 amb
 *   el detall dels camps.
 * - La resta d'errors amb `statusCode` (404, 415, 429... de Fastify) el mantenen.
 * - Qualsevol altra cosa és 500 i es registra, sense filtrar detalls al client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    if (error.validation) {
      return reply.code(400).send({
        error: "Petició invàlida",
        details: error.validation.map((issue) => ({
          path: issue.instancePath,
          message: issue.message,
        })),
      });
    }

    if (error.statusCode) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ error: "Internal server error (500)" });
  });
}

/**
 * 404/405 coherents: si el path existeix amb un altre mètode, es respon 405
 * amb la capçalera `Allow` en lloc d'un 404 enganyós.
 */
export function registerNotFound(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split("?")[0];

    // `findRoute` sí que resol els paràmetres (`/api/hidrants/:id`) i retorna
    // `null` quan el path no existeix amb aquell mètode.
    const allowed = KNOWN_METHODS.filter((method) => {
      if (method === request.method) {
        return false;
      }
      return Boolean(app.findRoute({ method, url }) as unknown);
    });

    if (allowed.length > 0) {
      return reply
        .code(405)
        .header("Allow", allowed.join(", "))
        .send({ error: "Method not allowed" });
    }

    return reply.code(404).send({ error: "Not found" });
  });
}
