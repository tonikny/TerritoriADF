import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { AppConfig } from "@territoriadf/contracts/config";

import { ROLE_PERMISSIONS } from "../permissions.js";
import { MAX_HYDRANT_MOVE_METERS } from "../utils/geo.js";
import { MIN_PASSWORD_LENGTH } from "../utils/password.js";

/**
 * Configuració pública que el frontend necessita i que ha de coincidir amb el backend.
 * Així el límit de moviment d'un hidrant es defineix només aquí (MAX_HYDRANT_MOVE_METERS),
 * la matriu rol → permisos només viu a back/src/permissions.ts i la longitud mínima de
 * contrasenya només a back/src/utils/password.ts: el front les consumeix (vista "veure com",
 * atribut `minLength` dels formularis) en lloc de mantenir-ne una còpia.
 */
export function registerAppConfigRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/config",
    {
      schema: {
        tags: ["config"],
        summary: "Configuració pública compartida amb el front (permisos, límits)",
      },
    },
    async (_request, reply) => {
      const config: AppConfig = {
        max_hydrant_move_meters: MAX_HYDRANT_MOVE_METERS,
        role_permissions: ROLE_PERMISSIONS,
        min_password_length: MIN_PASSWORD_LENGTH,
      };
      return reply.send(config);
    },
  );
}
