import { MAX_HYDRANT_MOVE_METERS } from "../utils/geo.js";
import { ROLE_PERMISSIONS } from "../permissions.js";
import { MIN_PASSWORD_LENGTH } from "../utils/password.js";
import type { ApiHandler } from "../types.js";

/**
 * Configuració pública que el frontend necessita i que ha de coincidir amb el backend.
 * Així el límit de moviment d'un hidrant es defineix només aquí (MAX_HYDRANT_MOVE_METERS),
 * la matriu rol → permisos només viu a back/src/permissions.ts i la longitud mínima de
 * contrasenya només a back/src/utils/password.ts: el front les consumeix (vista "veure com",
 * atribut `minLength` dels formularis) en lloc de mantenir-ne una còpia.
 */
const handler: ApiHandler = (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.json({
    max_hydrant_move_meters: MAX_HYDRANT_MOVE_METERS,
    role_permissions: ROLE_PERMISSIONS,
    min_password_length: MIN_PASSWORD_LENGTH,
  });
};

export default handler;
