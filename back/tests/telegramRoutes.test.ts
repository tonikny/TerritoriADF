// Rutes de Telegram per ADF: abast ADF, permisos, estats que la UI no ha de
// mentir (token indesxifrable, grup pendent), registre del bot i enllaç de grup.
// L'API de Telegram és un stub de `fetch`: es prova el servei de debò.
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TelegramBotsRepository,
  TelegramLinksRepository,
  type TelegramBotInsert,
} from "../src/db/repositories/telegramRepository.js";
import { decrypt, encrypt } from "../src/utils/crypto.js";
import { sha256hex } from "../src/services/telegramService.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import { ADF_278, ADF_279, resetWorld } from "./helpers/db.js";
import {
  callsTo,
  createTelegramBot,
  json,
  telegramFetch,
  TEST_TELEGRAM_TOKEN as VALID_TOKEN,
  type TelegramFetch,
} from "./helpers/telegram.js";

const OLD_TOKEN = `999999:${"B".repeat(30)}`;

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let volontariCookie: string;
let fetchMock: TelegramFetch;

function createBot(adfId: number, overrides: Partial<TelegramBotInsert> = {}) {
  createTelegramBot({
    id: `bot-${adfId}`,
    adf_id: adfId,
    chat_id: null,
    estat: "BOT_CONFIGURAT",
    ...overrides,
  });
}

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
  volontariCookie = await loginCookie(app, "278/002");
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

describe("autorització", () => {
  it("exigeix sessió i el permís manage_telegram", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
    });
    expect(anonymous.statusCode).toBe(401);

    const volunteer = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
      headers: { cookie: volontariCookie },
    });
    expect(volunteer.statusCode).toBe(403);
  });

  it("no deixa un coordinador tocar una altra ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_279}/telegram/status`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("GET /api/adfs/:id/telegram/status", () => {
  it("sense bot configurat respon NO_CONFIGURAT", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe("NO_CONFIGURAT");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marca TOKEN_INVALID si el token no es pot desxifrar", async () => {
    createBot(ADF_278, { token_enc: "no-és-un-payload-xifrat" });

    const response = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
      headers: { cookie: adminCookie },
    });

    expect(response.json<{ status: string }>().status).toBe("TOKEN_INVALID");
  });

  it("un CONFIGURAT sense chat_id es presenta com a GRUP_PENDENT", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: null });

    const response = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
      headers: { cookie: adminCookie },
    });

    expect(response.json<{ status: string }>().status).toBe("GRUP_PENDENT");
  });

  it("retorna l'estat real amb el nom del bot i del grup", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777, group_name: "Grup ADF" });

    const response = await app.inject({
      method: "GET",
      url: `/api/adfs/${ADF_278}/telegram/status`,
      headers: { cookie: adminCookie },
    });

    expect(response.json()).toEqual({
      status: "CONFIGURAT",
      bot_username: "bot_prova",
      bot_name: "Bot Prova",
      group_name: "Grup ADF",
    });
  });
});

describe("POST /api/adfs/:id/telegram", () => {
  const url = `/api/adfs/${ADF_278}/telegram`;

  it("valida que hi hagi token i que tingui el format de BotFather", async () => {
    const missing = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json<{ code: string }>().code).toBe("BAD_REQUEST");

    const malformed = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: "no-és-un-token" },
    });
    expect(malformed.statusCode).toBe(400);
    expect(callsTo(fetchMock, "getMe")).toHaveLength(0);
  });

  it("respon 400 en català si el cos JSON és buit", async () => {
    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie, "content-type": "application/json" },
      payload: "",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string; code: string }>()).toMatchObject({
      error: "Petició invàlida",
      code: "BAD_REQUEST",
    });
  });

  it("rebutja el JSON malformat i els intents de prototype pollution", async () => {
    const payloads = ["{no-json", '{"__proto__":{"contaminat":true},"token":"x"}'];

    for (const payload of payloads) {
      const response = await app.inject({
        method: "POST",
        url,
        headers: { cookie: adminCookie, "content-type": "application/json" },
        payload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string; code: string }>()).toMatchObject({
        error: "Petició invàlida",
        code: "BAD_REQUEST",
      });
    }
    expect(Object.prototype).not.toHaveProperty("contaminat");
  });

  it("rebutja un token que Telegram no reconeix", async () => {
    fetchMock.mockImplementation(async () => json({ ok: false, description: "Unauthorized" }, 401));

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    const body = response.json<{ code: string; error: string }>();
    expect(response.statusCode).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    // El motiu és de Telegram, no nostre: es mostra tal qual perquè és accionable.
    expect(body.error).toContain("Unauthorized");
  });

  it("registra el bot, desa el token xifrat i connecta el webhook", async () => {
    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "BOT_CONFIGURAT", bot_username: "bot_prova" });

    const row = TelegramBotsRepository.findByAdf(ADF_278)!;
    expect(row.bot_id).toBe(555);
    // El token no s'ha de desar en clar.
    expect(row.token_enc).not.toContain(VALID_TOKEN);
    expect(decrypt(row.token_enc)).toBe(VALID_TOKEN);

    const webhooks = callsTo(fetchMock, "setWebhook");
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0]!.url).toBe(`https://api.telegram.org/bot${VALID_TOKEN}/setWebhook`);
    expect(webhooks[0]!.body.secret_token).toBe(row.webhook_secret);
    expect(String(webhooks[0]!.body.url)).toContain(`/api/telegram/webhook/${row.webhook_secret}`);
  });

  it("respon 409 si el bot ja pertany a una altra ADF", async () => {
    createBot(ADF_279, { id: "bot-279" });

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(409);
    expect(TelegramBotsRepository.findByAdf(ADF_278)).toBeUndefined();
    expect(callsTo(fetchMock, "setWebhook")).toHaveLength(0);
  });

  it("en revalidar el mateix bot conserva el grup ja vinculat", async () => {
    createBot(ADF_278, {
      token_enc: encrypt(OLD_TOKEN),
      chat_id: 777,
      group_name: "Grup ADF",
      estat: "CONFIGURAT",
    });

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "CONFIGURAT",
      group_name: "Grup ADF",
    });
    expect(callsTo(fetchMock, "deleteWebhook")[0]!.url).toBe(
      `https://api.telegram.org/bot${OLD_TOKEN}/deleteWebhook`,
    );

    const row = TelegramBotsRepository.findByAdf(ADF_278)!;
    expect(row.chat_id).toBe(777);
    expect(decrypt(row.token_enc)).toBe(VALID_TOKEN);
  });

  it("retorna 404 per a una ADF que no existeix", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/adfs/999/telegram",
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(404);
  });

  it("retorna 502 si no es pot registrar el webhook", async () => {
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/setWebhook")
        ? json({ ok: false, description: "Telegram cau" }, 502)
        : json({ ok: true, result: { id: 555, username: "bot_prova", first_name: "Bot" } }),
    );

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { token: VALID_TOKEN },
    });

    expect(response.statusCode).toBe(502);
    expect(TelegramBotsRepository.findByAdf(ADF_278)).toBeUndefined();
  });
});

describe("POST /api/adfs/:id/telegram/link", () => {
  it("exigeix un bot configurat", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/adfs/${ADF_278}/telegram/link`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(400);
  });

  it("genera un deep link d'un sol ús i desa només el hash", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777 });

    const response = await app.inject({
      method: "POST",
      url: `/api/adfs/${ADF_278}/telegram/link`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ url: string; expires_at: string; bot_username: string }>();
    expect(body.url.startsWith("https://t.me/bot_prova?startgroup=")).toBe(true);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());

    const code = body.url.split("startgroup=")[1]!;
    const link = TelegramLinksRepository.findByCodeHash(sha256hex(code))!;
    expect(link.telegram_bot_id).toBe("bot-278");
    expect(TelegramBotsRepository.findByAdf(ADF_278)!.estat).toBe("GRUP_PENDENT");
    // Generar l'enllaç no crida Telegram.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rebutja un token indesxifrable amb un missatge accionable", async () => {
    createBot(ADF_278, { token_enc: "espatllat" });

    const response = await app.inject({
      method: "POST",
      url: `/api/adfs/${ADF_278}/telegram/link`,
      headers: { cookie: adminCookie },
    });

    const body = response.json<{ code: string; error: string }>();
    expect(response.statusCode).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    // El text accionable és el que fa que l'usuari pugui arreglar-ho.
    expect(body.error).toContain("no es pot desxifrar");
  });
});

describe("POST /api/adfs/:id/telegram/test", () => {
  const url = `/api/adfs/${ADF_278}/telegram/test`;

  it("no envia res si el grup encara no està vinculat", async () => {
    createBot(ADF_278, { estat: "GRUP_PENDENT", chat_id: null });

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(callsTo(fetchMock, "sendMessage")).toHaveLength(0);
  });

  it("envia la notificació de prova al grup", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777 });

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const messages = callsTo(fetchMock, "sendMessage");
    expect(messages).toHaveLength(1);
    expect(messages[0]!.url).toBe(`https://api.telegram.org/bot${VALID_TOKEN}/sendMessage`);
    expect(messages[0]!.body.chat_id).toBe(777);
    expect(String(messages[0]!.body.text)).toContain("Notificació de prova");
  });

  it("en mode text pla no interpreta el missatge de l'usuari com a HTML", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777 });

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: { message: "<b>hola</b>" },
    });

    expect(response.statusCode).toBe(200);
    const [message] = callsTo(fetchMock, "sendMessage");
    expect(message!.body.text).toBe("<b>hola</b>");
    expect("parse_mode" in message!.body).toBe(false);
  });

  it("retorna 502 si Telegram no accepta el missatge", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777 });
    fetchMock.mockImplementation(async () => json({ ok: false, description: "chat not found" }));

    const response = await app.inject({
      method: "POST",
      url,
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(502);
  });
});

describe("DELETE /api/adfs/:id/telegram", () => {
  it("desvincula el bot, esborra els enllaços i el webhook", async () => {
    createBot(ADF_278, { estat: "CONFIGURAT", chat_id: 777 });
    TelegramLinksRepository.create({
      id: "link",
      telegram_bot_id: "bot-278",
      code_hash: "hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/adfs/${ADF_278}/telegram`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(callsTo(fetchMock, "deleteWebhook")[0]!.url).toBe(
      `https://api.telegram.org/bot${VALID_TOKEN}/deleteWebhook`,
    );
    expect(TelegramBotsRepository.findByAdf(ADF_278)).toBeUndefined();
    expect(TelegramLinksRepository.findByCodeHash("hash")).toBeUndefined();
  });

  it("és idempotent si no hi ha bot", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/adfs/${ADF_278}/telegram`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(callsTo(fetchMock, "deleteWebhook")).toHaveLength(0);
  });
});
