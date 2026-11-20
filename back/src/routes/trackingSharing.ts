import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { ApiHandler } from "../types.js";

/**
 * PUT /api/adfs/:id/tracking-sharing
 * Comparteix/revoca el tracking d'una ADF amb la resta d'ADFs (opt-in global).
 * El permís `manage_own_adf_sharing` i l'abast ADF es declaren a `routes/index.ts`.
 */
const handler: ApiHandler = async (req, res) => {
  const adfId = Number(req.params?.id);
  const shared = req.body?.shared === true;

  if (!Number.isFinite(adfId)) {
    return res.status(400).json({ error: "ID d'ADF no vàlid" });
  }

  const adf = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
  if (!adf) {
    return res.status(404).json({ error: "ADF no trobada" });
  }

  db.update(adfs).set({ tracking_shared: shared }).where(eq(adfs.id, adfId)).run();
  return res.json({ adf_id: adfId, tracking_shared: shared });
};

export default handler;
