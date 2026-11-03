// Única peça del front que llegeix l'URL: la resta de components reben el resultat.
// L'enllaç d'accés és /acces/<token> (el genera POST /api/users/:id/access-link).
const ACCESS_PATH = /^\/acces\/([A-Za-z0-9_-]{20,})\/?$/;

export type Route = { name: "access"; token: string } | { name: "app" };

export function currentRoute(pathname: string = window.location.pathname): Route {
  const match = ACCESS_PATH.exec(pathname);
  return match ? { name: "access", token: match[1] } : { name: "app" };
}

/** Token de l'enllaç d'accés, o null si som a l'aplicació. */
export function accessToken(pathname?: string): string | null {
  const route = currentRoute(pathname);
  return route.name === "access" ? route.token : null;
}

export function navigateTo(path: string): void {
  window.history.replaceState({}, "", path);
}

/**
 * Entra a l'aplicació treient el token de la barra d'adreces. Recarrega perquè
 * /api/auth/me torni a demanar la sessió (la cookie ja l'ha posada el backend).
 */
export function enterApp(): void {
  navigateTo("/");
  window.location.reload();
}
