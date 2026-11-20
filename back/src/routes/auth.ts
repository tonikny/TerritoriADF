import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import { adfs, mqttUsers, users } from "../db/schema.js";
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
}) {
  // El rol a BD és nullable (default "voluntari"); normalitzem per no exposar null ni
  // signar un token amb un rol diferent del de la resposta.
  const role = user.role ?? "voluntari";

  const mqttRow = db
    .select()
    .from(mqttUsers)
    .where(and(eq(mqttUsers.user_id, user.id), eq(mqttUsers.enabled, true)))
    .get();

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
 * Es genera un cop a l'arrencada (cost ~100 ms, no per petició).
 */
const DUMMY_HASH = bcrypt.hashSync("login-timing-mitigation-synthetic-password", 10);

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
        const user = db.select().from(users).where(eq(users.username, username)).get();

        // Sempre es compara amb bcrypt (hash real o sintètic) perquè un usuari
        // inexistent no respongui mesurablement més ràpid (enumeració per timing).
        const hash = user?.password_hash ?? DUMMY_HASH;
        const ok = bcrypt.compareSync(password, hash);

        if (!user || !ok) {
          registerLoginFailure(username, request.ip);
          return reply.code(401).send({ error: "Usuari o contrasenya incorrectes" });
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

        return reply.send({ user: publicUser });
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
        return reply.code(401).send({ error: "No autenticat" });
      }
      return reply.send({ user: toPublicUser(request.authUser) });
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
      const user = db.select().from(users).where(eq(users.id, userId)).get();
      if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
        return reply.code(401).send({ error: "La contrasenya actual no és correcta" });
      }

      const adfNom = user.adf_id
        ? (db.select({ nom: adfs.nom }).from(adfs).where(eq(adfs.id, user.adf_id)).get()?.nom ??
          null)
        : null;

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
      const hash = bcrypt.hashSync(newPassword, 10);
      db.update(users)
        .set({ password_hash: hash, token_version: newVersion })
        .where(eq(users.id, userId))
        .run();

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
