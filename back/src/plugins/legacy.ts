import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { ApiHandler, ApiRequest, ApiResponse } from "../types.js";
import { clearSessionCookie, setSessionCookie } from "./auth.js";

/**
 * Pont entre els handlers antics (`ApiHandler`, amb `req`/`res` estil Express) i
 * Fastify. Les rutes que encara no s'han migrat a handlers natius es declaren a
 * `routes/index.ts` amb la seva autenticació i permís explícits i passen per
 * aquí; l'autorització ja s'ha resolt als `preHandler`, no en aquest adapter.
 *
 * Els handlers nous no han de fer servir res d'aquest fitxer: reben
 * `FastifyRequest`/`FastifyReply` i esquemes Zod.
 */
function createAdapter(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): ApiResponse {
  const adapter: ApiResponse = {
    // Connexions llargues (SSE): el handler fa `hijack()` i escriu directament al socket.
    _reply: reply,

    status(code: number) {
      reply.code(code);
      return adapter;
    },

    json(data: unknown) {
      // Si el handler ha marcat un usuari per signar (cas del login o del canvi de
      // contrasenya), se signa aquí el JWT i s'envia a la cookie httpOnly.
      if (adapter._userToSign) {
        setSessionCookie(app, request, reply, adapter._userToSign);
      }

      // Si el handler ha demanat esborrar la cookie (cas del logout).
      if (adapter._clearCookie) {
        clearSessionCookie(request, reply);
      }

      reply.send(data);
    },

    send(data: unknown) {
      reply.send(data);
    },

    end() {
      reply.send();
    },

    setHeader(name: string, value: string) {
      reply.header(name, value);
    },
  };

  return adapter;
}

export function toFastifyHandler(app: FastifyInstance, handler: ApiHandler) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const req: ApiRequest = {
      method: request.method,
      query: request.query,
      body: request.body,
      headers: request.headers,
      params: request.params,
      url: request.url,
      ip: request.ip,
      log: request.log,
      user: request.authUser ?? undefined,
    };

    await handler(req, createAdapter(app, request, reply));
  };
}
