import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Permission } from "../permissions.js";
import {
  ADF_FROM_BODY,
  requireAdfScope,
  requireAuth,
  requireComputedPermission,
} from "../plugins/authorize.js";
import { registerTelegramHit, telegramBlock } from "../services/telegramThrottle.js";
import { sendToAdf } from "../services/telegramService.js";
import { appBaseUrl } from "../utils/appUrl.js";
import { ui2Osm, type HydrantUiFields } from "../utils/osmConversion.js";
import { sendTelegramMessage } from "../utils/telegram.js";

/**
 * Notificacions de Telegram per a hidrants (creació/edició/esborrat).
 *
 * Endurit: requereix sessió, l'ADF notificada ha de ser la de l'usuari (excepte
 * admin), cal el permís de l'acció (create/edit/delete_hydrant) i hi ha fre
 * anti-spam per usuari/IP. No escriu a la BD: la creació es fa via
 * `POST /api/hidrants` i aquí només es notifica. No accepta text lliure
 * (`message` eliminat): el cos el construeix el servidor a partir de dades
 * estructurades.
 *
 * Autorització declarativa: `auth`, `adfScope` i `requireComputedPermission`
 * (el permís depèn de l'acció) es declaren a la ruta; el handler no comprova rols.
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

/**
 * Capacitat que exigeix la notificació segons l'acció del cos. Es declara a la
 * ruta amb `requireComputedPermission`, així el handler no comprova rols.
 * `null` vol dir que no cal cap permís: el cos no és cap ús permès i el handler
 * respon 400.
 */
/** `tags` porta el node d'OSM (`id` o `osm_id`) quan és un hidrant existent. */
function hasNodeId(tags: unknown): boolean {
  const record = tags as { id?: unknown; osm_id?: unknown } | undefined;
  return typeof record?.id === "string" || typeof record?.osm_id === "number";
}

export function notificationPermission(body: unknown): Permission | null {
  const data = (body ?? {}) as { action?: unknown; isEdit?: unknown; tags?: unknown };

  if (data.action === "delete") {
    return "delete_hydrant";
  }
  if (data.action === "create") {
    return "create_hydrant";
  }
  if (data.isEdit === true) {
    return "edit_hydrant";
  }

  return hasNodeId(data.tags) ? null : "create_hydrant";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function registerTelegramNotificationRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    "/api/sendToTelegram",
    {
      preHandler: [
        requireAuth,
        requireAdfScope(ADF_FROM_BODY),
        requireComputedPermission((request) => notificationPermission(request.body)),
      ],
      schema: {
        tags: ["telegram"],
        summary: "Notifica a Telegram un canvi d'hidrant",
        body: payloadSchema,
      },
    },
    async (request, reply) => {
      const user = request.authUser!;
      const { lat, lon, adf_id, tags, originalData, changes, isEdit, action } = request.body;

      const tagsRecord =
        tags && typeof tags === "object" && !Array.isArray(tags)
          ? (tags as Record<string, unknown>)
          : {};
      const hasId = hasNodeId(tagsRecord);

      // El camí "comentari" (id existent sense isEdit ni action, amb text lliure)
      // ja no és un ús permès; el permís de la resta d'accions el resol el guard.
      if (!action && !isEdit && hasId) {
        return reply.code(400).send({ error: "Ús no permès" });
      }

      const structuredBytes = Buffer.byteLength(
        JSON.stringify({ tags, originalData, changes }),
        "utf8",
      );
      if (structuredBytes > MAX_STRUCTURED_BYTES) {
        return reply.code(413).send({ error: "Dades massa grans per notificar" });
      }

      const blocked = telegramBlock(user.id, request.ip);
      if (blocked) {
        return reply
          .header("Retry-After", String(blocked.retryAfterSeconds))
          .code(429)
          .send({ error: blocked.error });
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
          const currentOsmTags = {
            ...((dbInfo.osm_tags as Record<string, string> | undefined) ?? {}),
          };
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

        const base = appBaseUrl(request);
        const appUrl =
          nodeId && action !== "delete" ? `${base}/?adf=${adf_id}&node=${nodeId}` : null;

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
        registerTelegramHit(user.id, request.ip);
        return reply.send({ ok: true });
      } catch (error) {
        return reply.code(500).send({ error: (error as Error).message || "Unexpected error" });
      }
    },
  );
}
