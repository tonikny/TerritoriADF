// Matriu de permisos compartida: rol → capacitats.
//
// És l'única font de veritat: el backend l'aplica als guards
// (`plugins/authorize.ts`) i el frontend la rep per `/api/auth/me` i la consulta
// amb `can()`. Per canviar permisos només cal tocar aquest fitxer.

/** Rols de l'aplicació: font única per a la matriu, els esquemes Zod i la BD. */
export const ROLES = ["admin", "coordinador", "voluntari"] as const;

export type Role = (typeof ROLES)[number];

/** Capacitats de l'aplicació. Els identificadors es queden en anglès. */
const PERMISSIONS = [
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
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

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

/**
 * Capacitats d'un rol. Un rol fora de la matriu (dada antiga o typo a la BD)
 * retorna una llista buida: el cridador decideix si ho ha de logar.
 */
export function permissionsFor(role: string): Permission[] {
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? [...perms] : [];
}

/** Comprovació puntual per a regles que depenen de dades (p. ex. l'usuari objectiu). */
export function hasPermission(role: string, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/**
 * Comprovació per al client: les capacitats arriben de `/api/auth/me`, així que
 * la UI no ha de comparar literals de text lliure. Com que el paràmetre és
 * `Permission`, un identificador inexistent falla al typecheck.
 */
export function can(
  permissions: readonly string[] | null | undefined,
  permission: Permission,
): boolean {
  return (permissions ?? []).includes(permission);
}
