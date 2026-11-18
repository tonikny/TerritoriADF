// Re-registra els webhooks de Telegram amb `secret_token`, necessari perquè
// Telegram enviï la capçalera X-Telegram-Bot-Api-Secret-Token.
// Dry-run per defecte; afegeix `--apply` per enviar els canvis a Telegram.
//
// Escriu el resultat per stdout a posta (no pel logger): si `FASTIFY_LOGLEVEL`
// és `warn` o superior, els `log.info` desapareixen i el comandament sembla que
// no faci res.
import { config } from "../utils/config.js";
import { db } from "../db/index.js";
import { telegramBots } from "../db/schema.js";
import { decrypt } from "../utils/crypto.js";
import { setWebhook } from "../services/telegramService.js";

const apply = process.argv.includes("--apply");

// `console` està prohibit al backend (eslint). Aquests dos helpers escriuen
// igualment per stdout/stderr, sense passar pel nivell del logger.
const out = (msg: string) => process.stdout.write(`${msg}\n`);
const fail = (msg: string) => process.stderr.write(`${msg}\n`);

async function main() {
  const publicBase = config.WEBHOOK_PUBLIC_URL?.trim();
  const base = publicBase
    ? publicBase.replace(/\/+$/, "")
    : `https://${config.BASE_DOMAIN_URL.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  const bots = db.select().from(telegramBots).all();

  if (bots.length === 0) {
    out("No hi ha bots de Telegram a la BD.");
    return;
  }

  out(`${bots.length} bot(s) a la BD · ${apply ? "APLICANT" : "dry-run"} · base ${base}`);

  let ok = 0;
  let failed = 0;

  for (const bot of bots) {
    // Cada bot s'aïlla. Un token corrupte, un `webhook_secret` absent o un
    // rebuig de Telegram no han d'impedir re-registrar els altres.
    try {
      if (!bot.webhook_secret) {
        throw new Error("el bot no té webhook_secret a la BD");
      }
      const token = bot.token_enc ? decrypt(bot.token_enc) : null;
      if (!token) {
        throw new Error("token absent o no desxifrable (has canviat ENCRYPTION_SECRET?)");
      }

      if (!apply) {
        out(`- ADF ${bot.adf_id}: pendent de re-registrar (dry-run)`);
        ok++;
        continue;
      }

      await setWebhook(
        token,
        `${base}/api/telegram/webhook/${bot.webhook_secret}`,
        bot.webhook_secret,
      );
      out(`- ADF ${bot.adf_id}: webhook re-registrat amb secret_token`);
      ok++;
    } catch (err) {
      failed++;
      process.exitCode = 1;
      const message = err instanceof Error ? err.message : String(err);
      fail(`- ADF ${bot.adf_id}: ERROR ${message}`);
    }
  }

  out(
    `${apply ? "Re-registre" : "Dry-run"} acabat: ${ok} correcte(s), ${failed} error(s).`,
  );
  if (!apply) {
    out("Dry-run: executa amb --apply per enviar els canvis a Telegram.");
  }
  if (failed > 0) {
    fail("Hi ha bots sense re-registrar; revisa els errors de dalt.");
  }
}

main().catch((err) => {
  fail(`Error inesperat al re-registre: ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});
