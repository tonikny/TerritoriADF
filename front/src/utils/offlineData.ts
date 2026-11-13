// Frescor de les dades que serveix el service worker i neteja de la caché
// d'API. Les respostes de `/api` poden contenir incidències privades, així que
// no han de sobreviure a un tancament de sessió.

const LAST_SYNC_PREFIX = "territoriadf-last-sync";
const API_CACHE_PREFIX = "api-";

/**
 * Desa el moment de l'última lectura bona de dades d'una ADF.
 *
 * Només compta si hi ha xarxa: si la resposta l'ha servida el service worker
 * (offline), el que s'ha carregat és precisament la còpia antiga i no s'ha de
 * refrescar la marca.
 */
export function markDataSynced(adfId: number): void {
  if (!navigator.onLine) {
    return;
  }
  try {
    localStorage.setItem(`${LAST_SYNC_PREFIX}:${adfId}`, String(Date.now()));
  } catch {
    /* sense localStorage (mode privat ple): l'indicador simplement no surt */
  }
}

/** Moment de l'última lectura des de xarxa, o `null` si no se'n té cap. */
export function getLastSync(adfId: number): number | null {
  try {
    const raw = localStorage.getItem(`${LAST_SYNC_PREFIX}:${adfId}`);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function clearLastSync(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(LAST_SYNC_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* res a fer */
  }
}

/**
 * Esborra les respostes d'API cachejades pel service worker i les marques de
 * frescor. Les tiles del mapa i el precache de l'app shell es conserven.
 */
export async function clearOfflineData(): Promise<void> {
  clearLastSync();
  if (!("caches" in window)) {
    return;
  }
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(API_CACHE_PREFIX)).map((name) => caches.delete(name)),
  );
}

/** Antiguitat en català: "fa menys d'un minut", "fa 12 min", "fa 3 h", "fa 2 dies". */
export function formatAge(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.floor((now - timestamp) / 60_000);
  if (minutes < 1) {
    return "fa menys d'un minut";
  }
  if (minutes < 60) {
    return `fa ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `fa ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "fa 1 dia" : `fa ${days} dies`;
}
