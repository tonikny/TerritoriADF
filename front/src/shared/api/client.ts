// Client únic de l'API pròpia.
//
// `request<T>()` és el punt d'entrada per a les crides tipades: afegeix la base
// de la URL, les capçaleres del mode "veure com", les credencials de sessió,
// serialitza el cos com a JSON, tradueix les respostes d'error a `ApiError`
// (amb `status` i `code`) i propaga l'`AbortSignal` que li passi qui crida.
//
// La injecció de capçaleres del mode "veure com" viu aquí i només aquí: cap
// component fa `fetch` a `/api/*` pel seu compte.
//
// Capçaleres del mode "veure com" de l'admin (`x-view-role` + `x-view-adf-id`,
// llegides de `localStorage`). El backend les ignora si la sessió no és
// d'admin, de manera que mai permeten escalar privilegis: només degraden una
// sessió real d'admin al rol/ADF previsualitzats.
import { storageKey } from "../../utils/storageKeys";

const VIEW_ROLE_KEY = storageKey("view_role");
// AdfContext guarda l'ADF activa amb la clau literal "active_adf_id" (sense prefix).
const ACTIVE_ADF_KEY = "active_adf_id";

// Rutes d'identitat de sessió: han de veure l'usuari real, mai el previsualitzat
// (`/api/auth/me` alimenta `rawUser`/`actualRole`; degradar-lo faria perdre
// l'admin la seva identitat real mentre dura la vista prèvia).
const PASSTHROUGH = ["/api/auth/", "/api/config"];

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Capçaleres de "veure com" (buit si no hi ha cap vista activa). */
function getViewAsHeaders(): Record<string, string> {
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

function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers;
}

/**
 * Afegeix les capçaleres de "veure com" a una petició de `/api/*`. Les rutes
 * d'identitat (`/api/auth/*`, `/api/config`) no les duen mai.
 */
function withViewAsHeaders(url: string, init: RequestInit): RequestInit {
  if (!url.includes("/api/") || PASSTHROUGH.some((p) => url.includes(p))) {
    return init;
  }
  const extra = getViewAsHeaders();
  if (Object.keys(extra).length === 0) {
    return init;
  }
  return { ...init, headers: { ...headersToObject(init.headers), ...extra } };
}

/** Error d'una resposta HTTP de l'API (o de xarxa, amb `status` 0). */
export class ApiError extends Error {
  readonly status: number;
  /** Codi estable si el backend en publica un; `null` si només hi ha missatge. */
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** Cert quan la petició no ha arribat a obtenir cap resposta (xarxa caiguda). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Missatge presentable d'un error de la capa d'API: el del backend si n'hi ha. */
export function apiErrorMessage(error: unknown, fallback = "Error de connexió"): string {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}

/** Paràmetres de query: `undefined` i `null` s'ometen. */
export type ApiQuery = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions extends Omit<RequestInit, "body" | "headers" | "method"> {
  method?: HttpMethod;
  headers?: Record<string, string>;
  /** Cos serialitzat com a JSON. */
  body?: unknown;
  query?: ApiQuery;
}

/** Construeix la URL amb la query serialitzada (sense paràmetres buits). */
export function buildUrl(path: string, query?: ApiQuery): string {
  if (!query) {
    return path;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (!qs) {
    return path;
  }
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

interface ApiErrorBody {
  error?: unknown;
  code?: unknown;
  message?: unknown;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Cos no JSON: queda el missatge genèric amb l'estat HTTP.
  }
  const message =
    typeof body.error === "string"
      ? body.error
      : typeof body.message === "string"
        ? body.message
        : `Error ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  const code = typeof body.code === "string" ? body.code : null;
  return new ApiError(message, response.status, code);
}

/**
 * Petició tipada a l'API pròpia.
 *
 * - `query` s'afegeix a la URL; `body` es serialitza com a JSON.
 * - `credentials: "same-origin"` per defecte (la sessió viatja en cookie httpOnly).
 * - Respostes no-2xx → `ApiError`; `AbortError` es propaga tal qual perquè qui
 *   crida (o TanStack Query) la pugui ignorar.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers, ...rest } = options;

  const init: RequestInit = {
    credentials: "same-origin",
    ...rest,
    method,
    headers,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json", ...headers };
  }

  const url = buildUrl(path, query);
  const response = await fetch(url, withViewAsHeaders(url, init));
  if (!response.ok) {
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const text = await response.text();
  if (text.trim() === "") {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("Resposta de l'API no vàlida", response.status, "INVALID_JSON");
  }
}
