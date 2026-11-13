import type { ApiHandler } from "../types.js";
import { ui2Osm } from "../utils/osmConversion.js";
import { HidrantsService } from "../services/hidrantsService.js";
import { sendTelegramMessage } from "../utils/telegram.js";
import { sendToAdf } from "../services/telegramService.js";
import { appBaseUrl } from "../utils/appUrl.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const handler: ApiHandler = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { lat, lon, tags, message, originalData, changes, adf_id, isEdit } = req.body;

    let title = "🗺️ <b>Nou Hidrant:</b>";
    let isNewHydrant = false;

    if (tags?.type === "incidencia") {
      title = "⚠️ <b>Nova Incidència:</b>";
    } else if (tags?.osm_id || tags?.id) {
      // Diferenciar entre edició i comentari
      title = isEdit ? "✏️ <b>Edició d'hidrant:</b>" : "💬 <b>Comentari de l'hidrant:</b>";
    } else {
      isNewHydrant = true;
    }

    // Si és un nou hidrant i tenim adf_id, el guardem a la BD
    let dbResult = null;
    if (isNewHydrant && adf_id) {
      dbResult = HidrantsService.createLocal(
        Number(adf_id),
        lat,
        lon,
        tags?.ui_fields,
        tags?.private_tags || {},
      );
    }

    // Preparem una còpia neta per Telegram amb la info de la BD
    const dbInfo = { ...tags };
    if (dbResult) {
      dbInfo.id = dbResult.id;
      dbInfo.sync_status = dbResult.sync_status;
    }

    if (dbInfo.ui_fields) {
      const currentOsmTags = { ...(dbInfo.osm_tags || {}) };
      const newOsmTags = ui2Osm(dbInfo.ui_fields);
      if (dbInfo.ui_fields.estat) {
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

    // Generar URL de l'aplicació utilitzant el Host de la petició,
    // substituint el buclic (localhost) per la IP LAN
    const base = appBaseUrl(req);
    const nodeId = tags?.id || dbResult?.id;
    const adfParam = adf_id ? `adf=${adf_id}&` : "";
    const appUrl = nodeId ? `${base}/?${adfParam}node=${nodeId}` : null;

    let contentSection = "";
    if (isEdit && originalData && changes && Object.keys(changes).length > 0) {
      contentSection = `
📋 <b>Dades originals:</b>
<pre>${escapeHtml(JSON.stringify(originalData, null, 2))}</pre>

✏️ <b>Canvis aplicats:</b>
<pre>${escapeHtml(JSON.stringify(changes, null, 2))}</pre>
`;
    } else {
      contentSection = `
🏷️ <b>Info BD:</b>
<pre>${escapeHtml(JSON.stringify(dbInfo, null, 2))}</pre>
`;
    }

    const displayUser = req.user?.username || "Anònim";
    // Només mostrem el comentari si n'hi ha: en edicions sempre arriba buit.
    const messageLine =
      typeof message === "string" && message.trim()
        ? `💬 Missatge: ${escapeHtml(message.trim())}\n`
        : "";

    const text = `
${title}

${appUrl ? `📍 <a href="${appUrl}">Veure a l'aplicació</a>` : ""}
📍 Coord: <code>${lat}, ${lon}</code>
${messageLine}👤 Per: ${escapeHtml(displayUser)}

${contentSection}
    `;

    await sendTelegramMessage(text);
    // A més del bot global de l'admin, notifiquem el grup de la mateixa ADF
    if (adf_id) {
      await sendToAdf(Number(adf_id), text);
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message || "Unexpected error" });
  }
};

export default handler;
