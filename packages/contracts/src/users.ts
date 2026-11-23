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
