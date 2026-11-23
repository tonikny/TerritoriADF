/**
 * Usuari exposat al client per `POST /api/auth/login` i `GET /api/auth/me`.
 *
 * Els permisos es deriven del rol al backend (`back/src/permissions.ts`); mai
 * no vénen de la BD.
 */
import type { Permission } from "./permissions.js";

export interface SessionUser {
  id: string;
  username: string;
  adf_id: number | null;
  role: string;
  mqtt_enabled: boolean;
  permissions: Permission[];
}

/** Resposta de `POST /api/auth/login` i `GET /api/auth/me`. */
export interface SessionResponse {
  user: SessionUser;
}

/** Fila de `GET /api/users`: camps públics de la taula `users`. */
export interface ManagedUser {
  id: string;
  username: string;
  adf_id: number | null;
  role: string | null;
  created_at: string | null;
}

/** Resposta de `POST /api/users/:id/access-link`. */
export interface AccessLink {
  id: string;
  username: string;
  /** El token en clar només surt en aquesta resposta. */
  access_url: string;
  access_expires_at: string;
}

/** Resposta de `POST /api/users`: l'usuari creat amb el seu enllaç d'accés. */
export interface CreatedUser extends ManagedUser {
  access_url: string;
  access_expires_at: string;
}
