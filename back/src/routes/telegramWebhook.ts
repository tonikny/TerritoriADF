// Webhook públic de Telegram: processa actualitzacions del bot per ADF.
// El secret de l'URL identifica el bot. No es confia en cap altra dada del client.
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { telegramBots, telegramLinks } from "../db/schema.js";
import type { ApiHandler } from "../types.js";
import { sendMessage, sha256hex } from "../services/telegramService.js";
import { decrypt } from "../utils/crypto.js";

const ALLOWED_CHAT_TYPES = new Set(["group", "supergroup"]);

/** Extreu el codi de vinculació del text del missatge (deep link startgroup). */
export function extractCode(text: string): string {
  const trimmed = text.trim();
  // Telegram pot enviar "/start <codi>" (com a @BotFather ho fa) o directament el codi
  if (trimmed.startsWith("/start")) {
    const m = trimmed.match(/\s+(\S+)/);
    return m ? m[1] : "";
  }
  return trimmed;
}

async function notifyGroupError(token: string, chatId: number, message: string) {
  try {
    await sendMessage(token, chatId, message);
  } catch {
    /* el bot pot no estar al grup encara: no podem avisar */
  }
}

/**
 * POST /api/telegram/webhook/:secret
 * Vincula un bot a un grup quan rep el codi del deep link startgroup.
 */
const webhook: ApiHandler = async (req, res) => {
  const secret = req.params?.secret as string | undefined;
  if (!secret) {
    return res.json({ ok: false });
  }
  const bot = db.select().from(telegramBots).where(eq(telegramBots.webhook_secret, secret)).get();
  if (!bot) {
    return res.json({ ok: false });
  }

  // Telegram envia aquesta capçalera si el webhook es va registrar amb
  // `secret_token`. Sense coincidència exacta no processem cap actualització.
  const headerSecret = req.headers?.["x-telegram-bot-api-secret-token"];
  if (typeof headerSecret !== "string" || headerSecret !== bot.webhook_secret) {
    return res.status(401).json({ ok: false });
  }

  const token = bot.token_enc ? decrypt(bot.token_enc) : null;
  const update = req.body;

  // --- 1. Missatge amb el codi de vinculació (startgroup) ---
  const msg = update?.message;
  if (typeof msg?.text === "string" && msg.text.length <= 128) {
    const code = extractCode(msg.text);
    if (code) {
      const chatId = msg.chat?.id as number | undefined;
      const chatType = msg.chat?.type as string | undefined;
      const chatTitle = msg.chat?.title as string | undefined;

      if (!ALLOWED_CHAT_TYPES.has(chatType ?? "")) {
        if (token && chatId !== undefined) {
          await notifyGroupError(
            token,
            chatId,
            "❌ Aquest enllaç només funciona en <b>grups</b> de Telegram. Tria un grup de la teva ADF.",
          );
        }
        return res.json({ ok: true });
      }

      const link = db
        .select()
        .from(telegramLinks)
        .where(eq(telegramLinks.code_hash, sha256hex(code)))
        .get();

      // No és el nostre codi, o el codi és d'un altre bot
      if (!link || link.telegram_bot_id !== bot.id || !chatId) {
        return res.json({ ok: true });
      }
      if (link.used_at) {
        if (token) {
          await notifyGroupError(
            token,
            chatId,
            "❌ Aquest enllaç de vinculació ja s'ha utilitzat.",
          );
        }
        return res.json({ ok: true });
      }
      if (new Date(link.expires_at).getTime() < Date.now()) {
        if (token) {
          await notifyGroupError(
            token,
            chatId,
            "⏳ Aquest enllaç de vinculació ha caducat. Torna a generar-lo des de l'aplicació.",
          );
        }
        return res.json({ ok: true });
      }

      // Un grup no pot estar vinculat a dues ADFs
      const conflict = db
        .select()
        .from(telegramBots)
        .where(and(eq(telegramBots.chat_id, chatId), ne(telegramBots.id, bot.id)))
        .get();
      if (conflict) {
        if (token) {
          await notifyGroupError(token, chatId, "❌ Aquest grup ja està vinculat a una altra ADF.");
        }
        return res.json({ ok: true });
      }

      // Vinculació correcta: guardem chat_id i marquem la sol·licitud com a usada
      db.update(telegramBots)
        .set({
          chat_id: chatId,
          group_name: chatTitle ?? null,
          estat: "CONFIGURAT",
          updated_at: new Date().toISOString(),
        })
        .where(eq(telegramBots.id, bot.id))
        .run();
      db.update(telegramLinks)
        .set({ used_at: new Date().toISOString() })
        .where(eq(telegramLinks.id, link.id))
        .run();

      if (token) {
        await notifyGroupError(
          token,
          chatId,
          "✅ <b>Grup vinculat correctament</b> amb l'aplicació. A partir d'ara rebràs aquí els avisos de la teva ADF.",
        );
      }
      return res.json({ ok: true });
    }
  }

  // --- 2. my_chat_member: el bot ha sortit / ha estat expulsat del grup ---
  const mcm = update?.my_chat_member;
  const newStatus = mcm?.new_chat_member?.status as string | undefined;
  if (newStatus === "left" || newStatus === "kicked") {
    // Només si el bot era vinculat a un grup: tornem a estat pendent
    if (bot.chat_id !== null) {
      db.update(telegramBots)
        .set({ estat: "GRUP_PENDENT", updated_at: new Date().toISOString() })
        .where(eq(telegramBots.id, bot.id))
        .run();
    }
  }

  return res.json({ ok: true });
};

export default webhook;
