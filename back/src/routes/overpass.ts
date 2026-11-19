import type { ApiHandler } from "../types.js";
import { queryOverpass } from "../services/overpass.js";

/**
 * El proxy és una funcionalitat d'usuaris autenticats (els hidrants públics
 * surten de la BD via GET /api/hidrants, sense passar per Overpass). Exigir
 * sessió evita que un script anònim abusi de la quota d'Overpass amb el
 * nostre User-Agent/contacte. Defensa en profunditat: server.ts també el
 * marca com a `protected`, i nginx hi aplica rate-limit + cos màxim.
 */
const MAX_QUERY_LENGTH = 8000;
const QUERY_TIMEOUT_MS = 25000;

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: "Sessió caducada o no vàlida" });
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

    const normalized = query.trim().replace(/\r/g, "");
    if (normalized.length < 10 || normalized.length > MAX_QUERY_LENGTH) {
      res.status(400).json({ error: "Query no vàlida" });
      return;
    }
    // Validació bàsica: només lectura en JSON (el servei fa response.json()).
    // Bloqueja `out:xml/csv`, escriptures i querys buides sense trencar el sync intern
    // (que no passa per aquest endpoint).
    if (!/\[out:json/i.test(normalized)) {
      res.status(400).json({ error: "Query no vàlida" });
      return;
    }

    // Timeout amb AbortController: el clearTimeout del finally evita que el
    // timer quedi viu després de respondre (no rete l'event loop ni deixa un
    // rebuig tardà com faria un Promise.race amb setTimeout sense netejar).
    // El signal aborta el fetch: no hi ha cap petició òrfena en marxa.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
    timer.unref();
    let result;
    try {
      result = await queryOverpass(normalized, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) {
        req.log.child({ module: "overpass", operation: "proxy" }).warn("Overpass proxy timeout");
        res.status(504).json({ error: "Error consultant Overpass" });
        return;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!result.ok) {
      req.log
        .child({ module: "overpass", operation: "proxy" })
        .warn({ status: result.status }, "Overpass upstream error");
      res.status(result.status === 429 ? 429 : 502).json({ error: "Error consultant Overpass" });
      return;
    }

    // Overpass retorna JSON
    res.status(200).json(result.data);
  } catch (err) {
    req.log
      .child({ module: "overpass", operation: "proxy" })
      .error({ err }, "Overpass proxy error");
    res.status(500).json({
      error: "Error intern del servidor",
    });
  }
};

export default handler;
