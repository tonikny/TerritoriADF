// Webhook públic de Telegram: el secret de l'URL identifica el bot i la
// capçalera `x-telegram-bot-api-secret-token` s'ha de comprovar. Es prova la
// vinculació del grup, la caducitat/ús del codi i la sortida del bot del grup.
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TelegramBotsRepository,
  TelegramLinksRepository,
  type TelegramBotInsert,
} from "../src/db/repositories/telegramRepository.js";
import { extractCode } from "../src/routes/telegramWebhook.js";
import { encrypt } from "../src/utils/crypto.js";
import { sha256hex } from "../src/services/telegramService.js";
import { createTestApp } from "./helpers/app.js";
import { ADF_278, resetWorld } from "./helpers/db.js";
import {
  callsTo,
  createTelegramBot,
  telegramFetch,
  type TelegramFetch,
} from "./helpers/telegram.js";

const BOT_ID = "bot-hook";
const SECRET = "webhook-secret";
const TOKEN = `123456:${"C".repeat(30)}`;

let app: FastifyInstance;
let fetchMock: TelegramFetch;

function createBot(overrides: Partial<TelegramBotInsert> = {}) {
  createTelegramBot({
    id: BOT_ID,
    token_enc: encrypt(TOKEN),
    webhook_secret: SECRET,
    chat_id: null,
    estat: "BOT_CONFIGURAT",
    ...overrides,
  });
}

function createLink(code: string, overrides: Record<string, unknown> = {}) {
  TelegramLinksRepository.create({
    id: "link-1",
    telegram_bot_id: BOT_ID,
    code_hash: sha256hex(code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    ...overrides,
  });
}

function hook(body: unknown, options: { secret?: string; header?: string | null } = {}) {
  const secret = options.secret ?? SECRET;
  const header = options.header === undefined ? SECRET : options.header;
  return app.inject({
    method: "POST",
    url: `/api/telegram/webhook/${secret}`,
    headers: header ? { "x-telegram-bot-api-secret-token": header } : {},
    payload: body as Record<string, unknown>,
  });
}

const groupMessage = (text: string) => ({
  message: { text, chat: { id: -1001, type: "supergroup", title: "Grup ADF" } },
});

function sentTexts(): string[] {
  return callsTo(fetchMock, "sendMessage").map((call) => String(call.body.text));
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetWorld();
  fetchMock = telegramFetch();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("extractCode", () => {
  it("accepta `/start <codi>` i el codi sol", () => {
    expect(extractCode("/start abc123")).toBe("abc123");
    expect(extractCode("  abc123  ")).toBe("abc123");
    expect(extractCode("/start")).toBe("");
  });
});

describe("POST /api/telegram/webhook/:secret", () => {
  it("respon sense fer res si el secret de l'URL no correspon a cap bot", async () => {
    const response = await hook(groupMessage("/start qualsevol"), { secret: "desconegut" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exigeix la capçalera secret_token de Telegram", async () => {
    createBot();

    expect((await hook(groupMessage("/start x"), { header: null })).statusCode).toBe(401);
    expect((await hook(groupMessage("/start x"), { header: "altre" })).statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("vincula el grup amb un codi vàlid d'un sol ús", async () => {
    createBot();
    createLink("codi-bo");

    const response = await hook(groupMessage("/start codi-bo"));

    expect(response.statusCode).toBe(200);
    const bot = TelegramBotsRepository.findByAdf(ADF_278)!;
    expect(bot.chat_id).toBe(-1001);
    expect(bot.group_name).toBe("Grup ADF");
    expect(bot.estat).toBe("CONFIGURAT");
    expect(TelegramLinksRepository.findByCodeHash(sha256hex("codi-bo"))!.used_at).not.toBeNull();

    const [message] = callsTo(fetchMock, "sendMessage");
    expect(message!.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(message!.body.chat_id).toBe(-1001);
    expect(String(message!.body.text)).toContain("Grup vinculat");
  });

  it("no vincula res en un xat privat i avisa el grup", async () => {
    createBot();

    const response = await hook({
      message: { text: "codi-bo", chat: { id: 42, type: "private" } },
    });

    expect(response.statusCode).toBe(200);
    expect(TelegramBotsRepository.findByAdf(ADF_278)!.chat_id).toBeNull();
    expect(sentTexts().some((text) => text.includes("només funciona en <b>grups</b>"))).toBe(true);
  });

  it("ignora un codi que ja s'ha fet servir", async () => {
    createBot();
    const code = "codi-usat";
    createLink(code, { used_at: new Date().toISOString() });

    await hook(groupMessage(code));

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.chat_id).toBeNull();
    expect(sentTexts().some((text) => text.includes("ja s'ha utilitzat"))).toBe(true);
  });

  it("ignora un codi caducat", async () => {
    createBot();
    const code = "codi-caducat";
    createLink(code, { expires_at: new Date(Date.now() - 1000).toISOString() });

    await hook(groupMessage(code));

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.chat_id).toBeNull();
    expect(sentTexts().some((text) => text.includes("ha caducat"))).toBe(true);
  });

  it("ignora un codi desconegut sense enviar res", async () => {
    createBot();

    await hook(groupMessage("/start inventat"));

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.chat_id).toBeNull();
    expect(callsTo(fetchMock, "sendMessage")).toHaveLength(0);
  });

  it("ignora missatges massa llargs (no són codis)", async () => {
    createBot();
    createLink("x");

    await hook(groupMessage(`/start ${"x".repeat(200)}`));

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.chat_id).toBeNull();
  });

  it("si el bot surt o és expulsat del grup, torna a GRUP_PENDENT", async () => {
    createBot({ chat_id: 777, estat: "CONFIGURAT" });

    await hook({ my_chat_member: { new_chat_member: { status: "kicked" } } });

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.estat).toBe("GRUP_PENDENT");
  });

  it("my_chat_member no toca res si el bot no tenia grup", async () => {
    createBot({ estat: "BOT_CONFIGURAT" });

    await hook({ my_chat_member: { new_chat_member: { status: "left" } } });

    expect(TelegramBotsRepository.findByAdf(ADF_278)!.estat).toBe("BOT_CONFIGURAT");
  });
});
