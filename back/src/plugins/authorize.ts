import type { FastifyRequest } from "fastify";

import { UsersRepository } from "../db/repositories/usersRepository.js";
import { ForbiddenError, UnauthorizedError } from "../errors.js";
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

const SESSION_EXPIRED = "Sessió caducada o no vàlida";
const PERMISSION_DENIED = "No tens permisos per realitzar aquesta acció";
const ADF_FORBIDDEN = "No tens permisos per editar aquesta ADF";
const USER_FORBIDDEN = "No tens permisos per gestionar aquest usuari";
const ADMIN_USER_FORBIDDEN = "Només l'administrador pot gestionar administradors";
const SELF_FORBIDDEN = "No et pots modificar a tu mateix";

/**
 * Els guards llancen `AppError` amb el codi del cas: `plugins/errors.ts` és
 * l'únic lloc que tradueix error → resposta HTTP.
 */
function requireUser(request: FastifyRequest) {
  const user = request.authUser;
  if (!user) {
    throw new UnauthorizedError(SESSION_EXPIRED, "SESSION_EXPIRED");
  }
  return user;
}

/** Capacitat que només té l'admin: abast global sobre usuaris i rols privilegiats. */
const GLOBAL_USERS: Permission = "manage_all_users";

/** preHandler: la ruta exigeix sessió. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  requireUser(request);
}

/**
 * preHandler: la ruta exigeix una capacitat de la matriu de permisos
 * (`back/src/permissions.ts`). S'ha de combinar amb `requireAuth` o declarar
 * `auth: true` a la ruta.
 */
export function requirePermission(
  permission: Permission,
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const user = requireUser(request);
    if (!permissionsFor(user.role).includes(permission)) {
      throw new ForbiddenError(PERMISSION_DENIED);
    }
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
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const user = requireUser(request);
    if (hasPermission(user.role, GLOBAL_USERS)) {
      return;
    }

    const targetId = (request.params as { id?: string } | undefined)?.id;
    if (!targetId) {
      return;
    }

    const target = UsersRepository.findScopeById(targetId);
    if (!target) {
      return;
    }

    if (options.denySelf && target.id === user.id) {
      throw new ForbiddenError(SELF_FORBIDDEN);
    }
    if (target.role === "admin") {
      throw new ForbiddenError(ADMIN_USER_FORBIDDEN);
    }
    if (user.adf_id === null || target.adf_id !== user.adf_id) {
      throw new ForbiddenError(USER_FORBIDDEN);
    }
  };
}

/**
 * preHandler: si el cos porta `username`, l'ADF del prefix ha de ser la pròpia
 * (l'admin, amb `manage_all_users`, pot qualsevol). Un format invàlid no es
 * rebutja aquí: ho fa el handler amb 400.
 */
export async function requireUsernameAdfScope(request: FastifyRequest): Promise<void> {
  const user = requireUser(request);
  if (hasPermission(user.role, GLOBAL_USERS)) {
    return;
  }

  // El format del username ja el valida l'esquema Zod de la ruta.
  const username = (request.body as { username?: unknown } | undefined)?.username;
  if (typeof username !== "string") {
    return;
  }

  if (user.adf_id === null || adfIdFromUsername(username) !== user.adf_id) {
    throw new ForbiddenError(USER_FORBIDDEN);
  }
}

/**
 * preHandler: només qui té la capacitat pot assignar el valor indicat al cos
 * (p. ex. `role: "admin"` a `/api/users`, que demana `manage_all_users`).
 */
export function requireBodyRolePermission(
  permission: Permission,
  key = "role",
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const user = requireUser(request);

    const body = request.body as Record<string, unknown> | undefined;
    if (body?.[key] !== "admin") {
      return;
    }
    if (!hasPermission(user.role, permission)) {
      throw new ForbiddenError(ADMIN_USER_FORBIDDEN);
    }
  };
}

/**
 * preHandler: la capacitat depèn del cos de la petició (p. ex. l'acció
 * notificada a `/api/sendToTelegram`). `resolve` retorna `null` per no exigir-ne cap.
 */
export function requireComputedPermission(
  resolve: (request: FastifyRequest) => Permission | null,
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const permission = resolve(request);
    if (!permission) {
      return;
    }

    const user = requireUser(request);
    if (!hasPermission(user.role, permission)) {
      throw new ForbiddenError(PERMISSION_DENIED);
    }
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
): (request: FastifyRequest) => Promise<void> {
  return async (request) => {
    const user = request.authUser;
    if (!user || user.role === "admin") {
      return;
    }

    const raw = sources
      .map((source) => readSource(request, source))
      .find((value) => value !== undefined && value !== null && value !== "");

    if (raw === undefined) {
      return;
    }

    const targetAdfId = Number(raw);
    if (!Number.isFinite(targetAdfId)) {
      return;
    }

    if (user.adf_id !== targetAdfId) {
      throw new ForbiddenError(ADF_FORBIDDEN, "ADF_FORBIDDEN");
    }
  };
}
