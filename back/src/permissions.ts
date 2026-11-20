// Matriu de permisos centralitzada: rol → capacitats.
// Per canviar permisos només cal tocar aquest fitxer.
import { logger } from "./utils/logger.js";

const log = logger.child({ module: "permissions" });

/** Rols de l'aplicació: font única per a la matriu, els esquemes Zod i la BD. */
export const ROLES = ["admin", "coordinador", "voluntari"] as const;

export type Role = (typeof ROLES)[number];

export type Permission =
  | "create_hydrant"
  | "edit_hydrant"
  | "delete_hydrant"
  | "sync_osm"
  | "view_sync_status"
  | "view_osm_link"
  | "view_own_adf_positions"
  | "view_shared_positions"
  | "view_all_positions"
  | "manage_own_adf_sharing"
  | "manage_telegram"
  | "manage_users"
  | "manage_all_users"
  | "manage_adfs"
  | "create_incidencia";

const ALL: Permission[] = [
  "create_hydrant",
  "edit_hydrant",
  "delete_hydrant",
  "sync_osm",
  "view_sync_status",
  "view_osm_link",
  "view_own_adf_positions",
  "view_shared_positions",
  "view_all_positions",
  "manage_own_adf_sharing",
  "manage_telegram",
  "manage_users",
  "manage_all_users",
  "manage_adfs",
  "create_incidencia",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL,
  coordinador: [
    "create_hydrant",
    "edit_hydrant",
    "delete_hydrant",
    "view_own_adf_positions",
    "view_shared_positions",
    "manage_own_adf_sharing",
    "manage_telegram",
    "manage_users",
    "create_incidencia",
  ],
  voluntari: ["create_hydrant", "edit_hydrant", "view_own_adf_positions", "create_incidencia"],
};

export function permissionsFor(role: string): Permission[] {
  const perms = ROLE_PERMISSIONS[role as Role];

  // Un rol fora de la matriu (dada antiga o typo a la BD) deixaria l'usuari autenticat
  // però sense cap permís. No ho amaguem: ho loguem i retornem una llista buida.
  if (!perms) {
    log.warn({ role }, "Rol desconegut: no té cap permís assignat");
    return [];
  }

  return [...perms];
}

/** Comprovació puntual per a regles que depenen de dades (p. ex. l'usuari objectiu). */
export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
