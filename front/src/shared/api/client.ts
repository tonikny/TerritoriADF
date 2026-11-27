// Client únic de l'API pròpia.
//
// `request<T>()` és el punt d'entrada per a les crides tipades: afegeix la base
// de la URL, les capçaleres del mode "veure com", les credencials de sessió,
// serialitza el cos com a JSON, tradueix les respostes d'error a `ApiError`
// (amb `status`, `code` i `requestId`) i propaga l'`AbortSignal` que li passi qui crida.
//
// La injecció de capçaleres del mode "veure com" viu aquí i només aquí: cap
// component fa `fetch` a `/api/*` pel seu compte.
//
// Capçaleres del mode "veure com" de l'admin (`x-view-role` + `x-view-adf-id`,
// llegides de `localStorage`). El backend les ignora si la sessió no és
// d'admin, de manera que mai permeten escalar privilegis: només degraden una
// sessió real d'admin al rol/ADF previsualitzats.
import { storageKey } from "@/utils/storageKeys";

const VIEW_ROLE_KEY = storageKey("view_role");
// AdfContext guarda l'ADF activa amb la clau literal "active_adf_id" (sense prefix).
const ACTIVE_ADF_KEY = "active_adf_id";

// Rutes d'identitat de sessió: han de veure l'usuari real, mai el previsualitzat
// (`/api/auth/me` alimenta `rawUser`/`actualRole`; degradar-lo faria perdre
// l'admin la seva identitat real mentre dura la vista prèvia).
const PASSTHROUGH = ["/api/auth/", "/api/config"];

/** Capçalera de l'ID de petició: el backend la retorna a totes les respostes. */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * ID de petició propi perquè també existeixi quan la resposta no arriba a ser
 * un error de l'API (tall de xarxa, timeout). `crypto.randomUUID` només existeix
 * en context segur; si no hi és, la petició surt sense ID i el backend en genera un.
 */
function newRequestId(): string | null {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : null;
}

/** Forma curta de l'ID per ensenyar-lo al costat d'un missatge d'error. */
export function requestIdReference(requestId: string | null | undefined): string | null {
  return typeof requestId === "string" && requestId.length > 0 ? requestId.slice(0, 8) : null;
}

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

/** Petició amb capçaleres ja normalitzades (les que construeix `request`). */
type ApiInit = RequestInit & { headers?: Record<string, string> };

/**
 * Afegeix les capçaleres de "veure com" a una petició de `/api/*`. Les rutes
 * d'identitat (`/api/auth/*`, `/api/config`) no les duen mai.
 */
function withViewAsHeaders(url: string, init: ApiInit): ApiInit {
  if (!url.includes("/api/") || PASSTHROUGH.some((p) => url.includes(p))) {
    return init;
  }
  const extra = getViewAsHeaders();
  if (Object.keys(extra).length === 0) {
    return init;
  }
  return { ...init, headers: { ...init.headers, ...extra } };
}

/** Error d'una resposta HTTP de l'API. */
export class ApiError extends Error {
  readonly status: number;
  /** Codi estable si el backend en publica un; `null` si només hi ha missatge. */
  readonly code: string | null;
  /** ID de la petició al log del backend, per creuar-ho amb una incidència. */
  readonly requestId: string | null;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Missatge presentable d'un error de la capa d'API: el del backend si n'hi ha.
 *  Hi afegeix la referència curta de la petició (`ref. 8f3c1a2b`) perquè qui
 *  reporti la incidència pugui trobar-la al log del backend (`grep`). */
export function apiErrorMessage(error: unknown, fallback = "Error de connexió"): string {
  if (error instanceof ApiError && error.message) {
    const reference = requestIdReference(error.requestId);
    return reference ? `${error.message} (ref. ${reference})` : error.message;
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
  requestId?: unknown;
  message?: unknown;
}

async function toApiError(response: Response, sentRequestId: string | null): Promise<ApiError> {
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
  // Prioritat: el cos de l'error, la capçalera de la resposta (també en respostes
  // que no són de l'API, com les d'un proxy) i, finalment, el que vam enviar.
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId
      : (response.headers.get(REQUEST_ID_HEADER) ?? sentRequestId);
  return new ApiError(message, response.status, code, requestId);
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
  const requestId = newRequestId();
  const baseHeaders: Record<string, string> = requestId
    ? { [REQUEST_ID_HEADER]: requestId, ...headers }
    : { ...headers };

  const init: ApiInit = {
    credentials: "same-origin",
    ...rest,
    method,
    headers: baseHeaders,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json", ...baseHeaders };
  }

  const url = buildUrl(path, query);
  const response = await fetch(url, withViewAsHeaders(url, init));
  if (!response.ok) {
    throw await toApiError(response, requestId);
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
    throw new ApiError("Resposta de l'API no vàlida", response.status, "INVALID_JSON", requestId);
  }
}
