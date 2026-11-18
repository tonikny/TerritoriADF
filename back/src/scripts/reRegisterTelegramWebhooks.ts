// Re-registra els webhooks de Telegram amb `secret_token`, necessari perquè
// Telegram enviï la capçalera X-Telegram-Bot-Api-Secret-Token.
// Dry-run per defecte; afegeix `--apply` per enviar els canvis a Telegram.
import { config } from "../utils/config.js";
import { db } from "../db/index.js";
import { telegramBots } from "../db/schema.js";
import { decrypt } from "../utils/crypto.js";
import { setWebhook } from "../services/telegramService.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "telegram", operation: "rewebhook" });
const apply = process.argv.includes("--apply");

async function main() {
  const publicBase = config.WEBHOOK_PUBLIC_URL?.trim();
  const base = publicBase
    ? publicBase.replace(/\/+$/, "")
    : `https://${config.BASE_DOMAIN_URL.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  const bots = db.select().from(telegramBots).all();

  if (bots.length === 0) {
    log.info("No hi ha bots de Telegram a la BD.");
    return;
  }

  for (const bot of bots) {
    const token = bot.token_enc ? decrypt(bot.token_enc) : null;
    if (!token) {
      log.warn({ adfId: bot.adf_id }, "Token no desxifrable; no es re-registra");
      process.exitCode = 1;
      continue;
    }

    if (!apply) {
      log.info({ adfId: bot.adf_id }, "Pendent de re-registrar (dry-run)");
      continue;
    }

    try {
      await setWebhook(
        token,
        `${base}/api/telegram/webhook/${bot.webhook_secret}`,
        bot.webhook_secret,
      );
      log.info({ adfId: bot.adf_id }, "Webhook re-registrat amb secret_token");
    } catch (err) {
      log.error({ err, adfId: bot.adf_id }, "Error re-registrant el webhook");
      process.exitCode = 1;
    }
  }

  if (!apply) {
    log.info("Dry-run: executa amb --apply per enviar els canvis a Telegram.");
  }
}

void main();
