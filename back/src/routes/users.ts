import type { AccessLink, CreatedUser, ManagedUser } from "@territoriadf/contracts/users";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.js";
import { adfs, mqttUsers, users } from "../db/schema.js";
import { BadRequestError } from "../errors.js";
import { hasPermission, ROLES } from "../permissions.js";
import {
  requireAuth,
  requireBodyRolePermission,
  requirePermission,
  requireTargetUserScope,
  requireUsernameAdfScope,
} from "../plugins/authorize.js";
import {
  ACCESS_TTL_NEW_USER_MS,
  ACCESS_TTL_RESET_MS,
  issueAccessToken,
} from "../services/accessTokens.js";
import { createMqttUser, deleteMqttUser, mqttNameFor } from "../services/mqtt.js";
import { appBaseUrl } from "../utils/appUrl.js";
import { decrypt } from "../utils/crypto.js";
import { adfIdFromUsername, USERNAME_MESSAGE, USERNAME_RE } from "../utils/identifiers.js";

const MISSING_FIELDS = "Falten camps: username, role";

function adfExists(adfId: number): boolean {
  return !!db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get();
}

const PUBLIC_FIELDS = {
  id: users.id,
  username: users.username,
  adf_id: users.adf_id,
  role: users.role,
  created_at: users.created_at,
};

/**
 * Enllaç d'accés d'un sol ús. El token en clar només surt en aquesta resposta: a la BD
 * queda el hash, o sigui que si l'enllaç es perd cal generar-ne un de nou.
 */
function accessPayload(
  request: FastifyRequest,
  userId: string,
  ttlMs: number,
): Pick<AccessLink, "access_url" | "access_expires_at"> {
  const { token, expires_at } = issueAccessToken(userId, ttlMs);
  return { access_url: `${appBaseUrl(request)}/acces/${token}`, access_expires_at: expires_at };
}

/** Manté la identitat MQTT (client DynSec + mqtt_users) alineada amb el nom d'usuari
 *  quan es re-num amb el username d'un usuari amb OwnTracks activat. */
async function propagateMqttRename(userId: string, newUsername: string): Promise<void> {
  const row = db.select().from(mqttUsers).where(eq(mqttUsers.user_id, userId)).get();
  const newMqName = mqttNameFor(newUsername);
  if (!row || row.mqtt_username === newMqName) {
    return;
  }
  const oldUsername = row.mqtt_username;
  if (oldUsername && row.mqtt_password_enc) {
    const password = decrypt(row.mqtt_password_enc);
    if (password) {
      try {
        await createMqttUser(newMqName, password);
      } catch {
        /* MQTT no disponible; es re-cread a la propera baixada de config */
      }
      try {
        await deleteMqttUser(oldUsername);
      } catch {
        /* client antic podria no existir a DynSec */
      }
    }
  }
  db.update(mqttUsers).set({ mqtt_username: newMqName }).where(eq(mqttUsers.id, row.id)).run();
}

const roleSchema = z
  .enum(ROLES, {
    error: (issue) =>
      issue.input === undefined ? MISSING_FIELDS : `Rol invàlid: ${String(issue.input)}`,
  })
  .describe("Rol de l'usuari");

const usernameSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? MISSING_FIELDS : USERNAME_MESSAGE),
  })
  .regex(USERNAME_RE, USERNAME_MESSAGE)
  .describe("Nom d'usuari: XXX/YYY o XXX/GI/YYY (3 dígits)");

const createBodySchema = z.object({
  username: usernameSchema,
  role: roleSchema,
});

const updateBodySchema = z.object({
  username: usernameSchema.optional().describe("Nou nom d'usuari (opcional)"),
  role: roleSchema.optional(),
});

const paramsSchema = z.object({
  id: z.string().describe("ID de l'usuari"),
});

/**
 * CRUD d'usuaris.
 *
 * L'esquema és el contracte: username amb format `XXX/YYY` o `XXX/GI/YYY`, rol
 * dins de `ROLES` i camps obligatoris a l'alta. L'autorització és declarativa:
 * `manage_users` (admin i coordinador) més els guards d'abast.
 */
export function registerUserRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const manage = [requireAuth, requirePermission("manage_users")];

  // GET /api/users: abast global (`manage_all_users`) o només la pròpia ADF.
  typed.get(
    "/api/users",
    {
      preHandler: manage,
      schema: { tags: ["users"], summary: "Llista d'usuaris (abast segons el rol)" },
    },
    async (request, reply) => {
      const user = request.authUser!;

      if (hasPermission(user.role, "manage_all_users")) {
        const rows: ManagedUser[] = db
          .select(PUBLIC_FIELDS)
          .from(users)
          .orderBy(users.username)
          .all();
        return reply.send(rows);
      }

      // Un coordinador sense ADF no té res a llistar: és una dada inconsistent a la BD.
      if (user.adf_id === null) {
        return reply.send([]);
      }

      const rows: ManagedUser[] = db
        .select(PUBLIC_FIELDS)
        .from(users)
        .where(eq(users.adf_id, user.adf_id))
        .orderBy(users.username)
        .all();
      return reply.send(rows);
    },
  );

  // POST /api/users: crear usuari personal.
  typed.post(
    "/api/users",
    {
      preHandler: [
        ...manage,
        requireUsernameAdfScope,
        requireBodyRolePermission("manage_all_users"),
      ],
      schema: {
        tags: ["users"],
        summary: "Crea un usuari i retorna l'enllaç d'accés (un sol ús)",
        body: createBodySchema,
      },
    },
    async (request, reply) => {
      const { username, role } = request.body;
      const adfId = adfIdFromUsername(username);

      if (!adfExists(adfId)) {
        throw new BadRequestError(`L'ADF ${adfId} no existeix`);
      }
      if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
        throw new BadRequestError(`El nom d'usuari ${username} ja existeix`);
      }

      const id = randomUUID();
      // Contrasenya aleatòria que ningú no coneix: l'usuari entra per l'enllaç d'accés i hi
      // tria la seva, així el coordinador no arriba a saber mai la contrasenya de ningú.
      const hash = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
      db.insert(users).values({ id, username, password_hash: hash, adf_id: adfId, role }).run();

      const row = db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, id)).get();
      if (!row) {
        throw new Error(`Usuari ${id} no trobat després de crear-lo`);
      }
      const created: CreatedUser = {
        ...row,
        ...accessPayload(request, id, ACCESS_TTL_NEW_USER_MS),
      };
      return reply.code(201).send(created);
    },
  );

  // PUT /api/users/:id: editar rol, contrasenya (reset) o username.
  typed.put(
    "/api/users/:id",
    {
      preHandler: [
        ...manage,
        requireTargetUserScope({ denySelf: true }),
        requireUsernameAdfScope,
        requireBodyRolePermission("manage_all_users"),
      ],
      schema: {
        tags: ["users"],
        summary: "Edita el rol i/o el nom d'usuari",
        params: paramsSchema,
        body: updateBodySchema,
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;
      const { username, role } = request.body;

      const target = db.select().from(users).where(eq(users.id, targetId)).get();
      if (!target) {
        throw new BadRequestError("Usuari no trobat");
      }

      const updates: Record<string, unknown> = {};

      if (username !== undefined) {
        const adfId = adfIdFromUsername(username);
        if (!adfExists(adfId)) {
          throw new BadRequestError(`L'ADF ${adfId} no existeix`);
        }
        const dup = db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.username, username), ne(users.id, targetId)))
          .get();
        if (dup) {
          throw new BadRequestError(`El nom d'usuari ${username} ja existeix`);
        }
        updates.username = username;
        updates.adf_id = adfId;
      }

      if (role !== undefined) {
        updates.role = role;
      }

      if (Object.keys(updates).length > 0) {
        db.update(users).set(updates).where(eq(users.id, targetId)).run();
      }
      if (username !== undefined && username !== target.username) {
        await propagateMqttRename(targetId, username);
      }
      const row = db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, targetId)).get();
      return reply.send(row);
    },
  );

  // DELETE /api/users/:id: eliminar usuari (mai a un mateix: ho comprova el guard).
  typed.delete(
    "/api/users/:id",
    {
      preHandler: [...manage, requireTargetUserScope({ denySelf: true })],
      schema: {
        tags: ["users"],
        summary: "Elimina un usuari i neteja la seva identitat MQTT",
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;

      const target = db.select().from(users).where(eq(users.id, targetId)).get();
      if (!target) {
        throw new BadRequestError("Usuari no trobat");
      }

      // Els fills de l'usuari els resol la BD amb les accions ON DELETE de
      // l'esquema: `mqtt_users` i `access_tokens` cauen en cascada i
      // `incidencia_events.usuari_id` queda a NULL. Només cal llegir la identitat
      // MQTT abans d'esborrar per netejar-la també a DynSec.
      const mqttUsername = db.transaction((tx) => {
        const row = tx
          .select({ mqtt_username: mqttUsers.mqtt_username })
          .from(mqttUsers)
          .where(eq(mqttUsers.user_id, targetId))
          .get();
        tx.delete(users).where(eq(users.id, targetId)).run();
        return row?.mqtt_username;
      });
      if (mqttUsername) {
        try {
          await deleteMqttUser(mqttUsername);
        } catch {
          /* MQTT pot no estar disponible; la neteja DB ja està feta */
        }
      }
      return reply.send({ success: true });
    },
  );

  // POST /api/users/:id/access-link: enllaç nou perquè l'usuari triï la seva contrasenya.
  typed.post(
    "/api/users/:id/access-link",
    {
      preHandler: [...manage, requireTargetUserScope()],
      schema: {
        tags: ["users"],
        summary: "Genera un enllaç d'accés nou (24 h) i invalida l'anterior",
        params: paramsSchema,
      },
    },
    async (request, reply) => {
      const targetId = request.params.id;

      const target = db.select().from(users).where(eq(users.id, targetId)).get();
      if (!target) {
        throw new BadRequestError("Usuari no trobat");
      }

      const link: AccessLink = {
        id: target.id,
        username: target.username,
        ...accessPayload(request, target.id, ACCESS_TTL_RESET_MS),
      };
      return reply.send(link);
    },
  );
}
