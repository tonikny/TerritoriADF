import { HidrantsService } from "../services/hidrantsService.js";
import type { ApiHandler } from "../types.js";
import { BadRequestError } from "../errors.js";
import { z } from "zod";

const createSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  ui_fields: z.any().optional(),
  private_tags: z.any().optional(),
});

const updateSchema = z.object({
  id: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  ui_fields: z.any().optional(),
  private_tags: z.any().optional(),
});

const handler: ApiHandler = async (req, res) => {
  const { method, url, query } = req;
  const adf_id = Number(query?.adf || req.body?.adf_id);

  if (!adf_id) {
    throw new BadRequestError("ADF ID not identified.");
  }

  // --- POST /api/hidrants/sync: Forçar sincronització amb OSM ---
  const isSyncPath = url?.split("?")[0].endsWith("/sync");
  if (method === "POST" && isSyncPath) {
    const force = req.body?.force === true;
    const result = await HidrantsService.forceSync(adf_id, force);
    const msg = force
      ? `Forçat des d'OSM: ${result.total} hidrants.`
      : `Sincronitzats ${result.total} hidrants d'OSM. ${result.skipped > 0 ? `${result.skipped} locals mantinguts.` : ""}${result.conflicts > 0 ? `${result.conflicts} conflictes nous.` : ""}`;
    return res.json({ success: true, message: msg, ...result });
  }

  // --- GET /api/hidrants/stats: Obtenir estadístiques de sincronització ---
  const isStatsPath = url?.split("?")[0].endsWith("/stats");
  if (method === "GET" && isStatsPath) {
    const stats = HidrantsService.getSyncStats(adf_id);
    return res.json(stats);
  }

  // --- GET: Llistar hidrants (GeoJSON) ---
  if (method === "GET") {
    // Els usuaris autenticats de qualsevol ADF poden veure les observacions privades;
    // els anònims reben el mateix GeoJSON sense `private_tags`.
    const geoJson = await HidrantsService.getGeoJson(adf_id, {
      includePrivateTags: Boolean(req.user),
    });
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return res.json(geoJson);
  }

  // --- POST: Crear nou hidrant local ---
  if (method === "POST") {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }
    const { lat, lon, ui_fields, private_tags } = parsed.data;
    const result = HidrantsService.createLocal(adf_id, lat, lon, ui_fields, private_tags);
    return res.status(201).json(result);
  }

  // --- PUT: Actualitzar hidrant ---
  if (method === "PUT") {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(parsed.error.message);
    }
    const id = req.params?.id || parsed.data.id;
    if (!id) {
      throw new BadRequestError("Missing hydrant ID");
    }

    const { lat, lon, ui_fields, private_tags } = parsed.data;
    const result = HidrantsService.updateLocal(id, adf_id, lat, lon, ui_fields, private_tags);
    return res.json(result);
  }

  // --- DELETE: Esborrar hidrant ---
  if (method === "DELETE") {
    const id = req.params?.id || req.query?.id;
    const result = HidrantsService.deleteLocal(id, adf_id);
    return res.json(result);
  }

  res.status(405).json({ error: "Method not allowed" });
};

export default handler;
