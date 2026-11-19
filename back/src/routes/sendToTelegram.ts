import { z } from "zod";
import type { ApiHandler } from "../types.js";
import { ui2Osm, type HydrantUiFields } from "../utils/osmConversion.js";
import { sendTelegramMessage } from "../utils/telegram.js";
import { sendToAdf } from "../services/telegramService.js";
import { appBaseUrl } from "../utils/appUrl.js";
import { permissionsFor } from "../permissions.js";
import { telegramBlock, registerTelegramHit } from "../services/telegramThrottle.js";

/**
 * Notificacions de Telegram per a hidrants (creació/edició/esborrat).
 *
 * Endurejit: requereix sessió (ruta `protected`), l'ADF notificada ha de ser la
 * de l'usuari (excepte admin), cal el permís de l'acció (create/edit/delete_hydrant)
 * i hi ha fre anti-spam per usuari/IP. No escriu a la BD: la creació es fa via
 * `POST /api/hidrants` i aquí només es notifica. No accepta text lliure (`message`
 * eliminat): el cos el construeix el servidor a partir de dades estructurades.
 */
const payloadSchema = z.object({
  lat: z.number().finite(),
  lon: z.number().finite(),
  adf_id: z.number().int().positive(),
  tags: z.unknown().optional(),
  originalData: z.unknown().optional(),
  changes: z.unknown().optional(),
  isEdit: z.boolean().optional(),
  action: z.enum(["create", "delete"]).optional(),
});

/** Mida màxima del resum estructurat per evitar missatges gegants a Telegram. */
const MAX_STRUCTURED_BYTES = 10_000;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const handler: ApiHandler = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Defensa en profunditat: la ruta ja és `protected` a server.ts, però aquí
  // també ho exigim perquè un canvi de registre no torni a obrir l'endpoint.
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Sessió caducada o no vàlida" });
    return;
  }

  const parsed = payloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Petició invàlida" });
    return;
  }
  const { lat, lon, adf_id, tags, originalData, changes, isEdit, action } = parsed.data;

  // Abast ADF: només la pròpia (admin exempte). El wrapper genèric ja ho comprova,
  // però ho repetim aquí perquè la lògica no depengui del registre de rutes.
  if (user.role !== "admin" && user.adf_id !== adf_id) {
    res.status(403).json({ error: "No tens permisos per editar aquesta ADF" });
    return;
  }

  const tagsRecord =
    tags && typeof tags === "object" && !Array.isArray(tags)
      ? (tags as Record<string, unknown>)
      : {};
  const hasId = typeof tagsRecord.id === "string" || typeof tagsRecord.osm_id === "number";

  // Permís segons l'acció notificada. El camí "comentari" (id existent sense
  // isEdit ni action, amb text lliure) s'ha eliminat: ja no és un ús permès.
  const perms = new Set(permissionsFor(user.role));
  if (action === "delete") {
    if (!perms.has("delete_hydrant")) {
      res.status(403).json({ error: "No tens permisos per realitzar aquesta acció" });
      return;
    }
  } else if (action === "create") {
    if (!perms.has("create_hydrant")) {
      res.status(403).json({ error: "No tens permisos per realitzar aquesta acció" });
      return;
    }
  } else if (isEdit) {
    if (!perms.has("edit_hydrant")) {
      res.status(403).json({ error: "No tens permisos per realitzar aquesta acció" });
      return;
    }
  } else if (hasId) {
    res.status(400).json({ error: "Ús no permès" });
    return;
  } else {
    if (!perms.has("create_hydrant")) {
      res.status(403).json({ error: "No tens permisos per realitzar aquesta acció" });
      return;
    }
  }

  const structuredBytes = Buffer.byteLength(
    JSON.stringify({ tags, originalData, changes }),
    "utf8",
  );
  if (structuredBytes > MAX_STRUCTURED_BYTES) {
    res.status(413).json({ error: "Dades massa grans per notificar" });
    return;
  }

  const blocked = telegramBlock(user.id, req.ip);
  if (blocked) {
    res.setHeader("Retry-After", String(blocked.retryAfterSeconds));
    res.status(429).json({ error: blocked.error });
    return;
  }

  try {
    let title = "🗺️ <b>Nou Hidrant:</b>";

    if (action === "delete") {
      title = "🗑️ <b>Hidrant esborrat:</b>";
    } else if (isEdit) {
      title = "✏️ <b>Edició d'hidrant:</b>";
    }

    // Preparem una còpia neta per Telegram (conversió ui_fields → osm_tags).
    const dbInfo = { ...(tagsRecord as Record<string, unknown>) };

    if (dbInfo.ui_fields) {
      const currentOsmTags = { ...((dbInfo.osm_tags as Record<string, string> | undefined) ?? {}) };
      const newOsmTags = ui2Osm(dbInfo.ui_fields as HydrantUiFields);
      if ((dbInfo.ui_fields as Record<string, unknown>).estat) {
        delete currentOsmTags["emergency"];
        delete currentOsmTags["disused:emergency"];
      }
      dbInfo.osm_tags = { ...currentOsmTags, ...newOsmTags };
      delete dbInfo.ui_fields;
    }

    // Reordenar per posar private_tags al final
    if (dbInfo.private_tags) {
      const privateTags = dbInfo.private_tags;
      delete dbInfo.private_tags;
      dbInfo.private_tags = privateTags;
    }

    const nodeId =
      typeof tagsRecord.id === "string"
        ? tagsRecord.id
        : typeof tagsRecord.osm_id === "number"
          ? String(tagsRecord.osm_id)
          : null;

    const base = appBaseUrl(req);
    const appUrl = nodeId && action !== "delete" ? `${base}/?adf=${adf_id}&node=${nodeId}` : null;

    let contentSection = "";
    if (
      isEdit &&
      originalData !== undefined &&
      changes !== undefined &&
      Object.keys((changes as Record<string, unknown>) ?? {}).length > 0
    ) {
      contentSection = `
📋 <b>Dades originals:</b>
<pre>${escapeHtml(JSON.stringify(originalData, null, 2))}</pre>

✏️ <b>Canvis aplicats:</b>
<pre>${escapeHtml(JSON.stringify(changes, null, 2))}</pre>
`;
    } else {
      const dataLabel =
        action === "delete"
          ? `📋 <b>Dades del node${nodeId ? ` <code>${escapeHtml(nodeId)}</code>` : ""} (abans d'esborrar):</b>`
          : "🏷️ <b>Info BD:</b>";
      contentSection = `
${dataLabel}
<pre>${escapeHtml(JSON.stringify(dbInfo, null, 2))}</pre>
`;
    }

    const displayUser = user.username || "Anònim";

    const text = `
${title}

${appUrl ? `📍 <a href="${appUrl}">Veure a l'aplicació</a>` : ""}
📍 Coord: <code>${lat}, ${lon}</code>
👤 Per: ${escapeHtml(displayUser)}

${contentSection}
    `;

    await sendTelegramMessage(text);
    // A més del bot global de l'admin, notifiquem el grup de la mateixa ADF
    await sendToAdf(adf_id, text);
    registerTelegramHit(user.id, req.ip);
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "Unexpected error" });
  }
};

export default handler;
