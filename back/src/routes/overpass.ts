import type { ApiHandler, ApiRequest } from "../types.js";
import { queryOverpass } from "../services/overpass.js";

/**
 * Comprova que la petició ve de la mateixa web. Els navegadors enviuen
 * `Origin` (o, si no, `Referer`) en un POST; `Sec-Fetch-Site` cobreix els
 * navegadors que els ometen. No és una barrera criptogràfica: un script pot
 * falsificar capçaleres, però un altre lloc web no pot fer servir l'endpoint.
 */
function isSameOrigin(req: ApiRequest): boolean {
  const host = typeof req.headers?.host === "string" ? req.headers.host : "";
  if (!host) {
    return false;
  }

  const origin = typeof req.headers?.origin === "string" ? req.headers.origin : "";
  const referer = typeof req.headers?.referer === "string" ? req.headers.referer : "";
  const source = origin || referer;

  if (source) {
    try {
      return new URL(source).host === host;
    } catch {
      return false;
    }
  }

  return req.headers?.["sec-fetch-site"] === "same-origin";
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!isSameOrigin(req)) {
    res.status(403).json({ error: "Aquest endpoint només es pot usar des de la web" });
    return;
  }

  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    res.status(415).json({ error: "Content-Type application/json required" });
    return;
  }

  try {
    const { query } = req.body ?? {};
    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Missing query" });
      return;
    }

    const result = await queryOverpass(query.trim().replace(/\r/g, ""));

    if (!result.ok) {
      res.status(result.status || 500).json({
        error: "Overpass error",
        details: result.error,
      });
      return;
    }

    // Overpass retorna JSON
    res.status(200).json(result.data);
  } catch (err) {
    res.status(500).json({
      error: (err as Error).message || "Unexpected error",
    });
  }
};

export default handler;
