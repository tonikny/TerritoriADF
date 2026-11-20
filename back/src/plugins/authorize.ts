import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";

import { db } from "../db/index.js";
import { users as usersTable } from "../db/schema.js";
import { hasPermission, permissionsFor, type Permission } from "../permissions.js";
import { adfIdFromUsername } from "../utils/identifiers.js";

/**
 * D'on surt l'ADF a la qual apunta una petició. Es declara per ruta, així que
 * l'abast ADF ja no depèn de com es digui el path.
 */
export type AdfSource = { from: "query" | "body" | "params"; key: string };

/** `?adf=ID` (la convenció de la majoria d'endpoints). */
export const ADF_FROM_QUERY: readonly AdfSource[] = [{ from: "query", key: "adf" }];

/** `{ adf_id }` al cos (creació d'incidències, push d'OSM...). */
export const ADF_FROM_BODY: readonly AdfSource[] = [{ from: "body", key: "adf_id" }];

/** Les dues formes alhora, per a rutes que admeten qualsevol de les dues. */
export const ADF_FROM_QUERY_OR_BODY: readonly AdfSource[] = [...ADF_FROM_QUERY, ...ADF_FROM_BODY];

const UNAUTHENTICATED = { error: "Sessió caducada o no vàlida" } as const;
const FORBIDDEN = { error: "No tens permisos per realitzar aquesta acció" } as const;
const FORBIDDEN_ADF = { error: "No tens permisos per editar aquesta ADF" } as const;
const FORBIDDEN_USER = { error: "No tens permisos per gestionar aquest usuari" } as const;
const FORBIDDEN_ADMIN_USER = {
  error: "Només l'administrador pot gestionar administradors",
} as const;
const FORBIDDEN_SELF = { error: "No et pots modificar a tu mateix" } as const;

/** Capacitat que només té l'admin: abast global sobre usuaris i rols privilegiats. */
const GLOBAL_USERS: Permission = "manage_all_users";

/** preHandler: la ruta exigeix sessió. */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  if (!request.authUser) {
    return reply.code(401).send(UNAUTHENTICATED);
  }
  return undefined;
}

/**
 * preHandler: la ruta exigeix una capacitat de la matriu de permisos
 * (`back/src/permissions.ts`). S'ha de combinar amb `requireAuth` o declarar
 * `auth: true` a la ruta.
 */
export function requirePermission(
  permission: Permission,
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined> {
  return async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send(UNAUTHENTICATED);
    }
    if (!permissionsFor(user.role).includes(permission)) {
      return reply.code(403).send(FORBIDDEN);
    }
    return undefined;
  };
}

/**
 * preHandler: abast sobre l'usuari objectiu d'`/api/users/:id`.
 *
 * Amb `manage_all_users` (només admin) no s'hi oposa. La resta només pot tocar
 * usuaris de la seva ADF, mai administradors, i amb `denySelf` tampoc a si mateix.
 * Si l'usuari objectiu no existeix, deixa passar: el handler respon 404.
 */
export function requireTargetUserScope(
  options: { denySelf?: boolean } = {},
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined> {
  return async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send(UNAUTHENTICATED);
    }
    if (hasPermission(user.role, GLOBAL_USERS)) {
      return undefined;
    }

    const targetId = (request.params as { id?: string } | undefined)?.id;
    if (!targetId) {
      return undefined;
    }

    const target = db
      .select({ id: usersTable.id, adf_id: usersTable.adf_id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, targetId))
      .get();
    if (!target) {
      return undefined;
    }

    if (options.denySelf && target.id === user.id) {
      return reply.code(403).send(FORBIDDEN_SELF);
    }
    if (target.role === "admin") {
      return reply.code(403).send(FORBIDDEN_ADMIN_USER);
    }
    if (user.adf_id === null || target.adf_id !== user.adf_id) {
      return reply.code(403).send(FORBIDDEN_USER);
    }

    return undefined;
  };
}

/**
 * preHandler: si el cos porta `username`, l'ADF del prefix ha de ser la pròpia
 * (l'admin, amb `manage_all_users`, pot qualsevol). Un format invàlid no es
 * rebutja aquí: ho fa el handler amb 400.
 */
export async function requireUsernameAdfScope(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const user = request.authUser;
  if (!user) {
    return reply.code(401).send(UNAUTHENTICATED);
  }
  if (hasPermission(user.role, GLOBAL_USERS)) {
    return undefined;
  }

  // El format del username ja el valida l'esquema Zod de la ruta.
  const username = (request.body as { username?: unknown } | undefined)?.username;
  if (typeof username !== "string") {
    return undefined;
  }

  if (user.adf_id === null || adfIdFromUsername(username) !== user.adf_id) {
    return reply.code(403).send(FORBIDDEN_USER);
  }

  return undefined;
}

/**
 * preHandler: només qui té la capacitat pot assignar el valor indicat al cos
 * (p. ex. `role: "admin"` a `/api/users`, que demana `manage_all_users`).
 */
export function requireBodyRolePermission(
  permission: Permission,
  key = "role",
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined> {
  return async (request, reply) => {
    const user = request.authUser;
    if (!user) {
      return reply.code(401).send(UNAUTHENTICATED);
    }

    const body = request.body as Record<string, unknown> | undefined;
    if (body?.[key] !== "admin") {
      return undefined;
    }
    if (!hasPermission(user.role, permission)) {
      return reply.code(403).send(FORBIDDEN_ADMIN_USER);
    }

    return undefined;
  };
}

/**
 * preHandler: la capacitat depèn del cos de la petició (p. ex. l'acció
 * notificada a `/api/sendToTelegram`). `resolve` retorna `null` per no exigir-ne cap.
 */
export function requireComputedPermission(
  resolve: (request: FastifyRequest) => Permission | null,
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined> {
  return async (request, reply) => {
    const permission = resolve(request);
    if (!permission) {
      return undefined;
    }

    const user = request.authUser;
    if (!user) {
      return reply.code(401).send(UNAUTHENTICATED);
    }
    if (!hasPermission(user.role, permission)) {
      return reply.code(403).send(FORBIDDEN);
    }

    return undefined;
  };
}

function readSource(request: FastifyRequest, source: AdfSource): unknown {
  const container = request[source.from] as Record<string, unknown> | undefined;
  return container?.[source.key];
}

/**
 * preHandler: un usuari lligat a una ADF només pot mutar dades de la seva
 * (l'admin té abast global).
 *
 * Si la petició no porta cap ADF, no s'hi oposa: cada handler decideix si
 * l'ADF és obligatòria o si la dedueix de la sessió (com fan els permisos
 * d'`/api/users`, que resolen l'abast a partir de l'usuari objectiu).
 */
export function requireAdfScope(
  sources: readonly AdfSource[] = ADF_FROM_QUERY_OR_BODY,
): (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined> {
  return async (request, reply) => {
    const user = request.authUser;
    if (!user || user.role === "admin") {
      return undefined;
    }

    const raw = sources
      .map((source) => readSource(request, source))
      .find((value) => value !== undefined && value !== null && value !== "");

    if (raw === undefined) {
      return undefined;
    }

    const targetAdfId = Number(raw);
    if (!Number.isFinite(targetAdfId)) {
      return undefined;
    }

    if (user.adf_id !== targetAdfId) {
      return reply.code(403).send(FORBIDDEN_ADF);
    }

    return undefined;
  };
}
