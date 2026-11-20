// Accés a l'API pròpia: totes les crides a `/api/*` passen per `apiFetch`
// (excepte auth i config, que han de veure la sessió real).
//
// Afegeix les capçaleres del mode "veure com" de l'admin (`x-view-role` +
// `x-view-adf-id`, llegides de `localStorage`). El backend les ignora si la
// sessió no és d'admin, de manera que mai permeten escalar privilegis: només
// degraden una sessió real d'admin al rol/ADF previsualitzats.
import { storageKey } from "./storageKeys";

const VIEW_ROLE_KEY = storageKey("view_role");
// AdfContext guarda l'ADF activa amb la clau literal "active_adf_id" (sense prefix).
const ACTIVE_ADF_KEY = "active_adf_id";

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Capçaleres de "veure com" (buit si no hi ha cap vista activa). */
export function getViewAsHeaders(): Record<string, string> {
  const role = readLS(VIEW_ROLE_KEY);
  if (role !== "coordinador" && role !== "voluntari") {
    return {};
  }
  const headers: Record<string, string> = { "x-view-role": role };
  const adf = readLS(ACTIVE_ADF_KEY);
  if (adf && /^\d+$/.test(adf.trim())) {
    headers["x-view-adf-id"] = adf.trim();
  }
  return headers;
}

// Rutes d'identitat de sessió: han de veure l'usuari real, mai el previsualitzat
// (`/api/auth/me` alimenta `rawUser`/`actualRole`; degradar-lo faria perdre
// l'admin la seva identitat real mentre dura la vista prèvia).
const PASSTHROUGH = ["/api/auth/", "/api/config"];

/** `fetch` amb les capçaleres de "veure com". Mateixa signatura que `fetch`. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("/api/") || PASSTHROUGH.some((p) => url.includes(p))) {
    return fetch(input, init);
  }
  const extra = getViewAsHeaders();
  if (Object.keys(extra).length === 0) {
    return fetch(input, init);
  }
  const base =
    init?.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : (init?.headers as Record<string, string> | undefined);
  return fetch(input, { ...init, headers: { ...base, ...extra } });
}
