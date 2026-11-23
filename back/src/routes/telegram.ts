// Configuració Telegram per ADF: registrar bot, vincular grup, prova i desvincular.
import type {
  TelegramLinkResponse,
  TelegramStatusResponse,
} from "@territoriadf/contracts/telegram";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import {
  TelegramBotsRepository,
  TelegramLinksRepository,
} from "../db/repositories/telegramRepository.js";
import { requireAdfScope, requireAuth, requirePermission } from "../plugins/authorize.js";
import {
  deleteWebhook,
  getMe,
  sendMessage,
  setWebhook,
  sha256hex,
} from "../services/telegramService.js";
import { APP_NAME } from "../utils/appInfo.js";
import { appBaseUrl } from "../utils/appUrl.js";
import { config } from "../utils/config.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import { adfIdParamsSchema } from "../utils/identifiers.js";

const LINK_TTL_MS = 15 * 60 * 1000;
const TOKEN_PATTERN = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

function newId() {
  return randomBytes(16).toString("hex");
}

function adfExists(adfId: number): boolean {
  return AdfsRepository.exists(adfId);
}

/** El token arriba com a text; es valida al handler per conservar els missatges. */
const registerBodySchema = z.object({ token: z.unknown().optional() }).optional();
const testBodySchema = z.object({ message: z.string().optional() }).optional();

/**
 * Rutes de Telegram per ADF.
 *
 * Autorització declarativa: `manage_telegram` (admin i coordinador) i abast ADF
 * sobre l'`:id` de la ruta; el handler no comprova rols.
 */
export function registerTelegramRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  const manage = [
    requireAuth,
    requirePermission("manage_telegram"),
    requireAdfScope([{ from: "params", key: "id" }]),
  ];

  // GET /api/adfs/:id/telegram/status — estat actual de la configuració.
  typed.get(
    "/api/adfs/:id/telegram/status",
    {
      preHandler: manage,
      schema: {
        tags: ["telegram"],
        summary: "Estat de la configuració de Telegram de l'ADF",
        params: adfIdParamsSchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      const bot = TelegramBotsRepository.findByAdf(adfId);
      if (!bot) {
        const body: TelegramStatusResponse = { status: "NO_CONFIGURAT" };
        return reply.send(body);
      }
      const token = bot.token_enc ? decrypt(bot.token_enc) : null;
      // Si el token no es pot desxifrar (p. ex. s'ha canviat ENCRYPTION_SECRET) no
      // es pot enviar res: no podem anunciar la configuració com a correcta.
      if (!token) {
        const body: TelegramStatusResponse = {
          status: "TOKEN_INVALID",
          bot_username: bot.bot_username,
          bot_name: bot.bot_name,
          group_name: bot.group_name,
        };
        return reply.send(body);
      }
      // Un estat CONFIGURAT sense chat_id no pot enviar missatges: el tractem com
      // a grup pendent de vincular perquè la UI no menteixi.
      const estat = bot.estat ?? "NO_CONFIGURAT";
      const effectiveStatus =
        estat === "CONFIGURAT" && bot.chat_id === null ? "GRUP_PENDENT" : estat;
      const body: TelegramStatusResponse = {
        status: effectiveStatus,
        bot_username: bot.bot_username,
        bot_name: bot.bot_name,
        group_name: bot.group_name,
      };
      return reply.send(body);
    },
  );

  // POST /api/adfs/:id/telegram — registra el bot (token de BotFather).
  typed.post(
    "/api/adfs/:id/telegram",
    {
      preHandler: manage,
      schema: {
        tags: ["telegram"],
        summary: "Registra el bot de Telegram de l'ADF",
        params: adfIdParamsSchema,
        body: registerBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      if (!adfExists(adfId)) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }

      const token = String(request.body?.token ?? "").trim();
      if (!token) {
        return reply.code(400).send({ error: "Falta el token del bot" });
      }
      if (!TOKEN_PATTERN.test(token)) {
        return reply.code(400).send({
          error: "Format de token no vàlid. Copia el token complet que et dona @BotFather.",
        });
      }

      let botInfo;
      try {
        botInfo = await getMe(token);
      } catch (err) {
        return reply.code(400).send({
          error: `El token no és vàlid o no correspon a cap bot (${err instanceof Error ? err.message : "error de Telegram"})`,
        });
      }

      // Un bot no pot estar assignat a dues ADFs
      const duplicated = TelegramBotsRepository.findByBotIdExceptAdf(botInfo.id, adfId);
      if (duplicated) {
        return reply.code(409).send({ error: "Aquest bot ja està vinculat a una altra ADF" });
      }

      let botId: string;
      const existing = TelegramBotsRepository.findByAdf(adfId);
      if (existing) {
        try {
          const oldToken = existing.token_enc ? decrypt(existing.token_enc) : null;
          if (oldToken) {
            await deleteWebhook(oldToken);
          }
        } catch {
          /* webhook antic pot no existir */
        }
        botId = existing.id;
      } else {
        botId = newId();
      }

      const webhookSecret = randomBytes(32).toString("hex");
      const publicBase =
        config.WEBHOOK_PUBLIC_URL?.trim().replace(/\/+$/, "") ?? appBaseUrl(request);
      const webhookUrl = `${publicBase}/api/telegram/webhook/${webhookSecret}`;
      try {
        await setWebhook(token, webhookUrl, webhookSecret);
      } catch (err) {
        return reply.code(502).send({
          error: `No s'ha pogut connectar el webhook amb Telegram (${webhookUrl}): ${
            err instanceof Error ? err.message : "error"
          }`,
        });
      }

      // Si es revalida EL MATEIX bot, conservem el grup ja vinculat: així, si el
      // token s'havia fet indesxifrable, n'hi ha prou de tornar-lo a enganxar i el
      // grup torna a funcionar sense haver de generar un enllaç nou.
      let newEstat: "CONFIGURAT" | "GRUP_PENDENT" | "BOT_CONFIGURAT" = "BOT_CONFIGURAT";
      let newChatId: number | null = null;
      let newGroupName: string | null = null;

      if (existing) {
        if (existing.bot_id === botInfo.id && existing.chat_id !== null) {
          newChatId = existing.chat_id;
          newGroupName = existing.group_name;
          newEstat = existing.estat === "CONFIGURAT" ? "CONFIGURAT" : "GRUP_PENDENT";
        }
        TelegramBotsRepository.update(existing.id, {
          bot_id: botInfo.id,
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
          token_enc: encrypt(token),
          webhook_secret: webhookSecret,
          chat_id: newChatId,
          group_name: newGroupName,
          estat: newEstat,
          updated_at: new Date().toISOString(),
        });
      } else {
        TelegramBotsRepository.create({
          id: botId,
          adf_id: adfId,
          bot_id: botInfo.id,
          bot_username: botInfo.username,
          bot_name: botInfo.first_name,
          token_enc: encrypt(token),
          webhook_secret: webhookSecret,
          estat: "BOT_CONFIGURAT",
        });
      }

      // Invalida sol·licituds de vinculació pendents del bot
      TelegramLinksRepository.deleteByBotId(botId);

      const body: TelegramStatusResponse = {
        status: newEstat,
        bot_username: botInfo.username,
        bot_name: botInfo.first_name,
        group_name: newGroupName ?? undefined,
      };
      return reply.send(body);
    },
  );

  // DELETE /api/adfs/:id/telegram — desvincula Telegram (deleteWebhook + neteja).
  typed.delete(
    "/api/adfs/:id/telegram",
    {
      preHandler: manage,
      schema: {
        tags: ["telegram"],
        summary: "Desvincula el bot de Telegram de l'ADF",
        params: adfIdParamsSchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      if (!adfExists(adfId)) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      const bot = TelegramBotsRepository.findByAdf(adfId);
      if (bot) {
        const token = bot.token_enc ? decrypt(bot.token_enc) : null;
        if (token) {
          try {
            await deleteWebhook(token);
          } catch {
            /* webhook pot no existir en Telegram */
          }
        }
        TelegramLinksRepository.deleteByBotId(bot.id);
        TelegramBotsRepository.delete(bot.id);
      }
      return reply.send({ ok: true });
    },
  );

  // POST /api/adfs/:id/telegram/link — genera deep link startgroup d'un sol ús.
  typed.post(
    "/api/adfs/:id/telegram/link",
    {
      preHandler: manage,
      schema: {
        tags: ["telegram"],
        summary: "Genera un enllaç d'un sol ús per vincular el grup",
        params: adfIdParamsSchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      if (!adfExists(adfId)) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      const bot = TelegramBotsRepository.findByAdf(adfId);
      if (!bot) {
        return reply.code(400).send({ error: "Primer configura el bot a l'apartat anterior" });
      }
      const token = bot.token_enc ? decrypt(bot.token_enc) : null;
      if (!token) {
        return reply.code(400).send({
          error:
            "El token del bot no es pot desxifrar. Enganxa'l de nou a «Introdueix el token»: el grup es mantindrà vinculat.",
        });
      }

      const code = randomBytes(24).toString("base64url");
      const expiresAt = new Date(Date.now() + LINK_TTL_MS).toISOString();

      // Només una sol·licitud pendent per bot: esborrem les anteriors
      TelegramLinksRepository.deleteByBotId(bot.id);
      TelegramLinksRepository.create({
        id: newId(),
        telegram_bot_id: bot.id,
        code_hash: sha256hex(code),
        expires_at: expiresAt,
      });
      TelegramBotsRepository.update(bot.id, {
        estat: "GRUP_PENDENT",
        updated_at: new Date().toISOString(),
      });

      const body: TelegramLinkResponse = {
        url: `https://t.me/${bot.bot_username}?startgroup=${code}`,
        expires_at: expiresAt,
        bot_username: bot.bot_username,
        bot_name: bot.bot_name,
      };
      return reply.send(body);
    },
  );

  // POST /api/adfs/:id/telegram/test — envia un missatge (o prova per defecte) al grup vinculat.
  typed.post(
    "/api/adfs/:id/telegram/test",
    {
      preHandler: manage,
      schema: {
        tags: ["telegram"],
        summary: "Envia un missatge de prova al grup vinculat",
        params: adfIdParamsSchema,
        body: testBodySchema,
      },
    },
    async (request, reply) => {
      const adfId = request.params.id;
      if (!adfExists(adfId)) {
        return reply.code(404).send({ error: "ADF no trobada" });
      }
      const bot = TelegramBotsRepository.findByAdf(adfId);
      if (!bot) {
        return reply.code(400).send({ error: "Primer configura el bot a l'apartat anterior" });
      }
      const token = bot.token_enc ? decrypt(bot.token_enc) : null;
      if (!token) {
        return reply.code(400).send({
          error:
            "El token del bot no es pot desxifrar. Enganxa'l de nou a «Introdueix el token»: el grup es mantindrà vinculat.",
        });
      }
      if (bot.estat !== "CONFIGURAT" || bot.chat_id === null) {
        return reply.code(400).send({ error: "El grup encara no està vinculat" });
      }

      const userMessage =
        typeof request.body?.message === "string" ? request.body.message.trim().slice(0, 4096) : "";
      try {
        if (userMessage) {
          // Mode pla: el missatge és de l'usuari, no l'interpretem com a HTML
          await sendMessage(token, bot.chat_id, userMessage, { parse_mode: undefined });
        } else {
          await sendMessage(
            token,
            bot.chat_id,
            `🔔 <b>Notificació de prova</b> — Aquest grup rep els avisos de l'aplicació ${APP_NAME}. Funciona!`,
          );
        }
      } catch (err) {
        return reply.code(502).send({
          error: `No s'ha pogut enviar el missatge: ${err instanceof Error ? err.message : "error de Telegram"}`,
        });
      }
      return reply.send({ ok: true });
    },
  );
}
