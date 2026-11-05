import { config } from "../utils/config.js";
import { APP_NAME } from "../utils/appInfo.js";

const OVERPASS_API_URL = config.OVERPASS_URL;
// La política d'Overpass demana un contacte vàlid al User-Agent. Si no està
// configurat, enviem només el nom de l'aplicació.
const OVERPASS_USER_AGENT = config.OVERPASS_CONTACT
  ? `${APP_NAME}/1.0 (${config.OVERPASS_CONTACT})`
  : `${APP_NAME}/1.0`;

export interface OsmElement {
  type?: string;
  id: number;
  lat: number;
  lon: number;
  version: number;
  timestamp: string;
  tags?: Record<string, string>;
}

export type OverpassResult =
  | { ok: true; status: number; data: { elements?: OsmElement[] } }
  | { ok: false; status: number; error: string };

/**
 * Execute a query against the Overpass API
 */
export async function queryOverpass(query: string): Promise<OverpassResult> {
  const response = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "User-Agent": OVERPASS_USER_AGENT,
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: query,
  });

  if (!response.ok) {
    const text = await response.text();
    // Retornem l'status per a que el cridant pugui decidir si és un error fatal o temporal
    return {
      ok: false,
      status: response.status,
      error: text,
    };
  }

  const data = (await response.json()) as { elements?: OsmElement[] };
  return {
    ok: true,
    status: 200,
    data,
  };
}
