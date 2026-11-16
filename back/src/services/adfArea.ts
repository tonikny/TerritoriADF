import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { ForbiddenError } from "../errors.js";
import { isPointInBoundary } from "../utils/geo.js";

/**
 * Indica si el punt cau dins del límit territorial desat de l'ADF.
 * Sense `boundary_geojson` (límits encara no calculats) no es bloqueja res.
 */
export function isPointInAdf(adfId: number, lat: number, lon: number): boolean {
  const adf = db
    .select({ boundary_geojson: adfs.boundary_geojson })
    .from(adfs)
    .where(eq(adfs.id, adfId))
    .get();

  return isPointInBoundary(lat, lon, adf?.boundary_geojson ?? null);
}

/**
 * Comprova que una posició nova (hidrant o incidència) pertany a l'ADF indicada.
 * És la defensa del servidor: el client pot enviar qualsevol lat/lon encara que la UI
 * només deixi clicar dins del límit.
 */
export function assertPointInAdf(adfId: number, lat: number, lon: number): void {
  if (!adfId) {
    return;
  }
  if (!isPointInAdf(adfId, lat, lon)) {
    throw new ForbiddenError("Coordenades fora del límit de l'ADF");
  }
}
