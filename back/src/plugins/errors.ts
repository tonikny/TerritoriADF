import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";

import { AppError, type ErrorCode } from "../errors.js";

const KNOWN_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Estat → codi i missatge per defecte. És l'única taula que tradueix els estats
 * genèrics: serveix per als errors que genera el propi Fastify (cos massa gran,
 * tipus de contingut no suportat...) i per completar les respostes que un
 * handler envia directament. Els missatges del framework són en anglès i no
 * s'han de filtrar a la persona que fa servir l'aplicació.
 */
const HTTP_FALLBACK: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: "BAD_REQUEST", message: "Petició invàlida" },
  401: { code: "UNAUTHORIZED", message: "Cal iniciar sessió" },
  403: { code: "FORBIDDEN", message: "No tens permisos per realitzar aquesta acció" },
  404: { code: "NOT_FOUND", message: "Recurs no trobat" },
  405: { code: "METHOD_NOT_ALLOWED", message: "Mètode no permès" },
  409: { code: "CONFLICT", message: "Conflicte amb l'estat actual" },
  410: { code: "GONE", message: "El recurs ja no és disponible" },
  413: { code: "PAYLOAD_TOO_LARGE", message: "La petició és massa gran" },
  415: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Tipus de contingut no suportat" },
  429: { code: "TOO_MANY_REQUESTS", message: "Massa peticions" },
  500: { code: "INTERNAL_ERROR", message: "Error intern del servidor" },
  502: { code: "BAD_GATEWAY", message: "El servei extern no ha respost correctament" },
  503: { code: "SERVICE_UNAVAILABLE", message: "Servei no disponible" },
  504: { code: "GATEWAY_TIMEOUT", message: "El servei extern ha trigat massa" },
};

/** Codi i missatge de reserva segons l'estat (mai buits). */
function fallbackFor(statusCode: number): { code: ErrorCode; message: string } {
  return (
    HTTP_FALLBACK[statusCode] ??
    (statusCode >= 500
      ? { code: "INTERNAL_ERROR", message: "Error intern del servidor" }
      : { code: "BAD_REQUEST", message: "Petició incorrecta" })
  );
}

interface ErrorPayload {
  error: string;
  code: ErrorCode;
  requestId: string;
  details?: unknown;
}

function errorPayload(
  request: FastifyRequest,
  code: ErrorCode,
  message: string,
  details?: unknown,
): ErrorPayload {
  return details === undefined
    ? { error: message, code, requestId: request.id }
    : { error: message, code, requestId: request.id, details };
}

function isErrorPayload(value: unknown): value is { error: string; [key: string]: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

/** Afegeix `code` i `requestId` sense trepitjar els que ja porti la resposta. */
function withErrorMeta(
  body: { error: string; [key: string]: unknown },
  statusCode: number,
  request: FastifyRequest,
): unknown {
  return {
    ...body,
    code: typeof body.code === "string" ? body.code : fallbackFor(statusCode).code,
    requestId: typeof body.requestId === "string" ? body.requestId : request.id,
  };
}

/**
 * Un únic punt de traducció error → resposta HTTP:
 * - `AppError` (domini) conserva el seu estat, el seu codi i el seu missatge.
 * - Els errors de validació d'esquema (Zod o JSON Schema) són sempre 400 amb
 *   el detall dels camps i codi `VALIDATION_ERROR`.
 * - La resta d'errors amb `statusCode` el mantenen; només es tradueix el text
 *   dels que genera el propi Fastify (`FST_ERR_*`), no el d'una altra llibreria.
 * - Qualsevol altra cosa és 500 i es registra, sense filtrar detalls al client.
 *
 * Totes les respostes ≥ 400 surten amb la forma `{ error, code, requestId }`,
 * també les que un handler envia directament (`reply.code(403).send({ error })`):
 * el hook `onSend` completa el codi i l'ID de petició quan hi falten, de manera
 * que el client no ha de mirar prosa ni conèixer cada ruta.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode < 400) {
      return payload;
    }

    if (typeof payload === "string") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        // Cos no JSON: no hi ha res a normalitzar.
        return payload;
      }
      if (!isErrorPayload(parsed)) {
        return payload;
      }
      return JSON.stringify(withErrorMeta(parsed, reply.statusCode, request));
    }

    if (!isErrorPayload(payload)) {
      return payload;
    }
    return withErrorMeta(payload, reply.statusCode, request);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(errorPayload(request, error.code, error.message));
    }

    if (error.validation) {
      return reply.code(400).send(
        errorPayload(
          request,
          "VALIDATION_ERROR",
          "Petició invàlida",
          error.validation.map((issue) => ({ path: issue.instancePath, message: issue.message })),
        ),
      );
    }

    if (error.statusCode) {
      const fallback = fallbackFor(error.statusCode);
      const message = error.code.startsWith("FST_ERR_") ? fallback.message : error.message;
      return reply.code(error.statusCode).send(errorPayload(request, fallback.code, message));
    }

    request.log.error(error);
    return reply
      .code(500)
      .send(errorPayload(request, "INTERNAL_ERROR", "Error intern del servidor"));
  });
}

/**
 * 404/405 coherents: si el path existeix amb un altre mètode, es respon 405
 * amb la capçalera `Allow` en lloc d'un 404 enganyós.
 */
export function registerNotFound(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const url = request.url.split("?")[0] ?? request.url;

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
        .send(errorPayload(request, "METHOD_NOT_ALLOWED", "Mètode no permès"));
    }

    return reply.code(404).send(errorPayload(request, "NOT_FOUND", "Recurs no trobat"));
  });
}
