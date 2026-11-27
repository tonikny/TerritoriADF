// Enllaç d'accés d'un sol ús:
//   GET  /api/auth/access/:token → només el nom d'usuari (per saludar a la pantalla)
//   POST /api/auth/access/:token → { password }: desa la contrasenya triada per l'usuari
//                                   i li deixa la sessió oberta.
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AccessTokensRepository } from "../db/repositories/accessTokensRepository.js";
import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { UsersRepository } from "../db/repositories/usersRepository.js";
import type { ErrorCode } from "../errors.js";
import { setSessionCookie } from "../plugins/auth.js";
import { findAccessToken } from "../services/accessTokens.js";
import { passwordProblem } from "../utils/password.js";
import { toPublicUser } from "./auth.js";

type AccessTarget =
  { userId: string; tokenId: string } | { error: string; status: number; code: ErrorCode };

/** Resol el token a un usuari, o retorna l'error que s'ha de mostrar a l'usuari. */
function resolveToken(rawToken: string | undefined): AccessTarget {
  if (!rawToken) {
    return { error: "Enllaç no vàlid", status: 404, code: "ACCESS_LINK_INVALID" };
  }

  const row = findAccessToken(rawToken);
  if (!row) {
    return {
      error: "Aquest enllaç no és vàlid. Demana'n un de nou al teu coordinador.",
      status: 404,
      code: "ACCESS_LINK_INVALID",
    };
  }
  if (row.used_at) {
    return {
      error: "Aquest enllaç ja s'ha fet servir. Si no has pogut entrar, demana'n un de nou.",
      status: 410,
      code: "ACCESS_LINK_USED",
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return {
      error: "Aquest enllaç ha caducat. Demana'n un de nou al teu coordinador.",
      status: 410,
      code: "ACCESS_LINK_EXPIRED",
    };
  }

  const user = UsersRepository.findById(row.user_id);
  if (!user) {
    return { error: "Aquest enllaç ja no és vàlid.", status: 404, code: "ACCESS_LINK_INVALID" };
  }
  return { userId: user.id, tokenId: row.id };
}

const tokenParamsSchema = z.object({ token: z.string() });
const redeemBodySchema = z.object({ password: z.string().optional() });

export function registerAccessRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/auth/access/:token",
    {
      schema: {
        tags: ["auth"],
        summary: "Usuari de l'enllaç d'accés",
        params: tokenParamsSchema,
      },
    },
    async (request, reply) => {
      const target = resolveToken(request.params.token);
      if ("error" in target) {
        return reply.code(target.status).send({ error: target.error, code: target.code });
      }

      const user = UsersRepository.findById(target.userId);
      if (!user) {
        return reply
          .code(404)
          .send({ error: "Aquest enllaç ja no és vàlid.", code: "ACCESS_LINK_INVALID" });
      }
      return reply.send({ username: user.username });
    },
  );

  typed.post(
    "/api/auth/access/:token",
    {
      schema: {
        tags: ["auth"],
        summary: "Tria la contrasenya amb l'enllaç d'accés",
        params: tokenParamsSchema,
        body: redeemBodySchema,
      },
    },
    async (request, reply) => {
      const target = resolveToken(request.params.token);
      if ("error" in target) {
        return reply.code(target.status).send({ error: target.error, code: target.code });
      }

      const { password } = request.body;

      const user = UsersRepository.findById(target.userId);
      if (!user) {
        return reply
          .code(404)
          .send({ error: "Aquest enllaç ja no és vàlid.", code: "ACCESS_LINK_INVALID" });
      }

      const adfNom = user.adf_id ? AdfsRepository.findName(user.adf_id) : null;

      const problem = passwordProblem(password, "La contrasenya", {
        username: user.username,
        adfNom,
      });
      if (problem) {
        return reply.code(400).send({ error: problem });
      }

      const hash = await bcrypt.hash(password as string, 10);
      const usedAt = new Date().toISOString();
      // La nova contrasenya invalida qualsevol sessió anterior d'aquest usuari.
      const newVersion = (user.token_version ?? 0) + 1;

      AccessTokensRepository.redeem({
        tokenId: target.tokenId,
        userId: user.id,
        passwordHash: hash,
        tokenVersion: newVersion,
        usedAt,
      });

      const publicUser = toPublicUser(user);
      setSessionCookie(app, request, reply, {
        id: publicUser.id,
        username: publicUser.username,
        adf_id: publicUser.adf_id,
        role: publicUser.role,
        tv: newVersion,
      });

      request.log
        .child({ module: "auth", operation: "access_redeem" })
        .info({ username: user.username }, "Contrasenya creada per enllaç d'accés");

      return reply.send({ user: publicUser });
    },
  );
}
