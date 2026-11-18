import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ApiHandler } from "../types.js";
import { permissionsFor } from "../permissions.js";

/**
 * PUT /api/adfs/:id/tracking-sharing
 * Comparteix/revoca el tracking d'una ADF amb la resta d'ADFs (opt-in global).
 * Admin pot qualsevol ADF; coordinador només la seva (permís manage_own_adf_sharing).
 */
const handler: ApiHandler = async (req, res) => {
  // Endpoint de mutació: només PUT. Un GET no ha de poder desactivar la compartició.
  if (req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = req.user!;
  const adfId = Number(req.params?.id);
  const shared = req.body?.shared === true;

  if (!Number.isFinite(adfId)) {
    return res.status(400).json({ error: "ID d'ADF no vàlid" });
  }

  const adf = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
  if (!adf) {
    return res.status(404).json({ error: "ADF no trobada" });
  }

  const perms = permissionsFor(user.role);
  const allowed =
    user.role === "admin" || (perms.includes("manage_own_adf_sharing") && user.adf_id === adfId);
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "No tens permisos per modificar la compartició d'aquesta ADF" });
  }

  db.update(adfs).set({ tracking_shared: shared }).where(eq(adfs.id, adfId)).run();
  return res.json({ adf_id: adfId, tracking_shared: shared });
};

export default handler;
