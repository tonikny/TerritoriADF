// Matriu de permisos centralitzada: rol → capacitats.
//
// La matriu viu a `@territoriadf/contracts/permissions` perquè el frontend i el
// backend en comparteixin una sola còpia. Aquí només hi afegim el logging del
// backend: un rol desconegut no ha de passar en silenci.
import {
  ROLE_PERMISSIONS,
  ROLES,
  hasPermission,
  permissionsFor as sharedPermissionsFor,
  type Permission,
  type Role,
} from "@territoriadf/contracts/permissions";

import { logger } from "./utils/logger.js";

const log = logger.child({ module: "permissions" });

export { ROLE_PERMISSIONS, ROLES, hasPermission };
export type { Permission };

export function permissionsFor(role: string): Permission[] {
  // Un rol fora de la matriu (dada antiga o typo a la BD) deixaria l'usuari
  // autenticat però sense cap permís. No ho amaguem: ho loguem i retornem una
  // llista buida.
  if (!ROLE_PERMISSIONS[role as Role]) {
    log.warn({ role }, "Rol desconegut: no té cap permís assignat");
  }

  return sharedPermissionsFor(role);
}
