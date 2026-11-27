import bcrypt from "bcryptjs";
import type { SessionResponse, SessionUser } from "@territoriadf/contracts/users";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { MqttUsersRepository } from "../db/repositories/mqttUsersRepository.js";
import { UsersRepository } from "../db/repositories/usersRepository.js";
import { permissionsFor } from "../permissions.js";
import { clearSessionCookie, setSessionCookie } from "../plugins/auth.js";
import { requireAuth } from "../plugins/authorize.js";
import { loginBlock, registerLoginFailure, resetLoginFailures } from "../services/loginThrottle.js";
import { passwordProblem } from "../utils/password.js";

/**
 * Usuari exposat al client. Mateix shape per a /login i /me: els permisos es deriven
 * del rol aquí (única font de veritat: back/src/permissions.ts), mai no vénen de la BD.
 */
export function toPublicUser(user: {
  id: string;
  username: string;
  adf_id: number | null;
  role: string | null;
}): SessionUser {
  // El rol a BD és nullable (default "voluntari"); normalitzem per no exposar null ni
  // signar un token amb un rol diferent del de la resposta.
  const role = user.role ?? "voluntari";

  const mqttRow = MqttUsersRepository.findEnabledByUserId(user.id);

  return {
    id: user.id,
    username: user.username,
    adf_id: user.adf_id,
    role,
    mqtt_enabled: !!mqttRow,
    permissions: permissionsFor(role),
  };
}

/**
 * Hash sintètic per igualar el cost de bcrypt quan l'usuari no existeix.
 * Evita enumeració d'usuaris per timing: sempre es fa una comparació bcrypt.
 * Es calcula de manera asíncrona la primera vegada que cal i es reutilitza: no
 * bloqueja l'event loop en importar el mòdul (com faria `hashSync`) ni a cada
 * petició.
 */
const DUMMY_PASSWORD = "login-timing-mitigation-synthetic-password";
let dummyHashPromise: Promise<string> | null = null;

function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash(DUMMY_PASSWORD, 10);
  return dummyHashPromise;
}

const credentialsBodySchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
});

const newPasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  /** POST /api/auth/login — body: { username, password } */
  typed.post(
    "/api/auth/login",
    {
      schema: {
        tags: ["auth"],
        summary: "Inicia sessió",
        body: credentialsBodySchema,
      },
    },
    async (request, reply) => {
      const { username, password } = request.body;

      if (!username || !password) {
        return reply.code(400).send({ error: "Falten credencials" });
      }

      // Fre de força bruta: es mira abans de tocar bcrypt per no gastar CPU amb atacs.
      const blocked = loginBlock(username, request.ip);
      if (blocked) {
        request.log
          .child({ module: "auth", operation: "login" })
          .warn({ username }, "Login bloquejat per massa intents");
        return reply
          .header("Retry-After", String(blocked.retryAfterSeconds))
          .code(429)
          .send({ error: blocked.error });
      }

      try {
        const user = UsersRepository.findByUsername(username);

        // Sempre es compara amb bcrypt (hash real o sintètic) perquè un usuari
        // inexistent no respongui mesurablement més ràpid (enumeració per timing).
        const hash = user?.password_hash ?? (await dummyHash());
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok) {
          registerLoginFailure(username, request.ip);
          return reply
            .code(401)
            .send({ error: "Usuari o contrasenya incorrectes", code: "INVALID_CREDENTIALS" });
        }

        resetLoginFailures(username, request.ip);

        const publicUser = toPublicUser(user);
        setSessionCookie(app, request, reply, {
          id: publicUser.id,
          username: publicUser.username,
          adf_id: publicUser.adf_id,
          role: publicUser.role,
          tv: user.token_version ?? 0,
        });

        const body: SessionResponse = { user: publicUser };
        return reply.send(body);
      } catch (err) {
        request.log
          .child({ module: "auth", operation: "login" })
          .error({ err, username }, "Login error");
        return reply.code(500).send({ error: "Error intern del servidor" });
      }
    },
  );

  /** POST /api/auth/logout */
  typed.post(
    "/api/auth/logout",
    { schema: { tags: ["auth"], summary: "Tanca la sessió" } },
    async (request, reply) => {
      clearSessionCookie(request, reply);
      return reply.send({ success: true });
    },
  );

  /** GET /api/auth/me */
  typed.get(
    "/api/auth/me",
    { schema: { tags: ["auth"], summary: "Usuari de la sessió" } },
    async (request, reply) => {
      if (!request.authUser) {
        return reply.code(401).send({ error: "No autenticat", code: "SESSION_EXPIRED" });
      }
      const body: SessionResponse = { user: toPublicUser(request.authUser) };
      return reply.send(body);
    },
  );

  /** PUT /api/auth/password — body: { currentPassword, newPassword } */
  typed.put(
    "/api/auth/password",
    {
      preHandler: [requireAuth],
      schema: {
        tags: ["auth"],
        summary: "Canvia la contrasenya pròpia",
        body: newPasswordBodySchema,
      },
    },
    async (request, reply) => {
      const userId = request.authUser!.id;
      const { currentPassword, newPassword } = request.body;

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: "Cal indicar la contrasenya actual i la nova" });
      }
      const user = UsersRepository.findById(userId);
      const currentPasswordOk = user
        ? await bcrypt.compare(currentPassword, user.password_hash)
        : false;
      if (!user || !currentPasswordOk) {
        return reply.code(401).send({ error: "La contrasenya actual no és correcta" });
      }

      const adfNom = user.adf_id ? AdfsRepository.findName(user.adf_id) : null;

      const problem = passwordProblem(newPassword, "La contrasenya nova", {
        username: user.username,
        adfNom,
      });
      if (problem) {
        return reply.code(400).send({ error: problem });
      }

      // Invalida totes les altres sessions (inclosa una cookie robada): la sessió
      // actual se resigna amb la nova versió perquè l'usuari no perdi l'accés.
      const newVersion = (user.token_version ?? 0) + 1;
      const hash = await bcrypt.hash(newPassword, 10);
      UsersRepository.updatePassword(userId, hash, newVersion);

      setSessionCookie(app, request, reply, {
        id: user.id,
        username: user.username,
        adf_id: user.adf_id,
        role: user.role ?? "voluntari",
        tv: newVersion,
      });

      request.log
        .child({ module: "auth", operation: "changePassword" })
        .info({ username: user.username }, "Contrasenya actualitzada");

      return reply.send({ success: true });
    },
  );
}
