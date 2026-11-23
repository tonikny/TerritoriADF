/**
 * Configuració pública que el front consumeix de `GET /api/config`.
 *
 * Els valors els defineix només el backend (`MAX_HYDRANT_MOVE_METERS`,
 * `MIN_PASSWORD_LENGTH` i la matriu de permisos); el front no en manté cap
 * còpia, només en llegeix els camps.
 */
import type { Permission, Role } from "./permissions.js";

export interface AppConfig {
  max_hydrant_move_meters: number;
  min_password_length: number;
  /** Capacitats de cada rol, per a la vista prèvia de l'admin. */
  role_permissions: Record<Role, readonly Permission[]>;
}
