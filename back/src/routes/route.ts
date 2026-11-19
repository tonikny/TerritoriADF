import type { ApiHandler } from "../types.js";
import { config } from "../utils/config.js";

const COORD_RE = /^-?\d{1,3}(\.\d{1,7})?,-?\d{1,3}(\.\d{1,7})?$/;

function parseLatLon(value: unknown): { lat: number; lon: number } | null {
  if (typeof value !== "string" || !COORD_RE.test(value.trim())) {
    return null;
  }
  const [latStr, lonStr] = value.trim().split(",");
  const lat = Number(latStr);
  const lon = Number(lonStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return null;
  }
  return { lat, lon };
}

const handler: ApiHandler = async (req, res) => {
  try {
    const from = parseLatLon(req.query?.from);
    const to = parseLatLon(req.query?.to);

    if (!from || !to) {
      return res
        .status(400)
        .json({ error: "Paràmetres 'from' i 'to' obligatoris en format lat,lon" });
    }

    const apiKey = config.GRAPHHOPPER_API_KEY;
    if (!apiKey) {
      req.log
        .child({ module: "routing", operation: "graphHopper" })
        .error("GRAPHHOPPER_API_KEY no configurada");
      return res.status(503).json({ error: "El servei de rutes no està disponible" });
    }

    const url =
      `https://graphhopper.com/api/1/route?point=${encodeURIComponent(`${from.lat},${from.lon}`)}` +
      `&point=${encodeURIComponent(`${to.lat},${to.lon}`)}` +
      `&vehicle=car&points_encoded=false&locale=en&key=${encodeURIComponent(apiKey)}`;

    req.log
      .child({ module: "routing", operation: "graphHopper" })
      .debug({ from, to }, "Requesting GraphHopper route");

    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      req.log
        .child({ module: "routing", operation: "graphHopper" })
        .warn({ status: r.status }, "GraphHopper upstream error");
      return res.status(502).json({ error: "No s'ha pogut calcular la ruta" });
    }
    const text = await r.text();

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch {
      req.log
        .child({ module: "routing", operation: "graphHopper" })
        .error({ status: r.status }, "GraphHopper response was not JSON");
      return res.status(502).json({ error: "No s'ha pogut calcular la ruta" });
    }
  } catch (err) {
    req.log.child({ module: "routing", operation: "graphHopper" }).error({ err }, "Routing error");
    res.status(500).json({ error: "Error intern del servidor" });
  }
};

export default handler;
