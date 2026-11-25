// Client HTTP de Telegram: el que es prova és la forma de les crides (URL, cos,
// timeout) i que un error de Telegram no tombi res del cridador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteWebhook,
  getMe,
  sendMessage,
  sendToAdf,
  setWebhook,
  sha256hex,
} from "../src/services/telegramService.js";
import { sendTelegramMessage } from "../src/utils/telegram.js";
import { config } from "../src/utils/config.js";
import { ADF_278, resetWorld } from "./helpers/db.js";
import { bodyOf, createTelegramBot, json } from "./helpers/telegram.js";

const fetchMock = vi.fn();

let originalToken: string | undefined;
let originalChat: string | undefined;

beforeEach(() => {
  resetWorld();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  originalToken = config.TELEGRAM_BOT_TOKEN;
  originalChat = config.TELEGRAM_CHAT_ID;
  config.TELEGRAM_BOT_TOKEN = undefined;
  config.TELEGRAM_CHAT_ID = undefined;
});

afterEach(() => {
  config.TELEGRAM_BOT_TOKEN = originalToken;
  config.TELEGRAM_CHAT_ID = originalChat;
  vi.unstubAllGlobals();
});

describe("sha256hex", () => {
  it("retorna el SHA-256 en hex", () => {
    expect(sha256hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("getMe", () => {
  it("valida el token i retorna la informació del bot", async () => {
    const info = { id: 555, username: "bot_prova", first_name: "Bot" };
    fetchMock.mockResolvedValue(json({ ok: true, result: info }));

    await expect(getMe("123:abc")).resolves.toEqual(info);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:abc/getMe",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rebutja un result sense id o username", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, result: { id: 0 } }));

    await expect(getMe("123:abc")).rejects.toThrow("cap bot vàlid");
  });

  it("rebutja amb la descripció de Telegram", async () => {
    fetchMock.mockResolvedValue(json({ ok: false, description: "Unauthorized" }, 400));

    await expect(getMe("123:abc")).rejects.toThrow("Unauthorized");
  });

  it("rebutja amb l'estat HTTP si no hi ha descripció", async () => {
    fetchMock.mockResolvedValue(json({ ok: false, description: undefined }, 502));

    await expect(getMe("123:abc")).rejects.toThrow("Telegram getMe (502)");
  });
});

describe("setWebhook i deleteWebhook", () => {
  it("registra el webhook amb secret i les actualitzacions que ens interessen", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, result: true }));

    await setWebhook("token", "https://example.test/hook", "s3cret");

    expect(bodyOf(fetchMock)).toEqual({
      url: "https://example.test/hook",
      allowed_updates: ["message", "my_chat_member"],
      drop_pending_updates: true,
      secret_token: "s3cret",
    });
  });

  it("permet ajustar les actualitzacions i esborra el webhook", async () => {
    fetchMock.mockResolvedValue(json({ ok: true, result: true }));

    await setWebhook("token", "https://example.test/hook", "s3cret", ["message"]);
    expect(bodyOf(fetchMock)).toEqual(expect.objectContaining({ allowed_updates: ["message"] }));

    fetchMock.mockResolvedValue(json({ ok: true, result: true }));
    await deleteWebhook("token");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.telegram.org/bottoken/deleteWebhook",
      expect.objectContaining({ body: "{}" }),
    );
  });
});

describe("sendMessage", () => {
  it("envia HTML amb preview i accepta sobreescriure camps", async () => {
    // Un `Response` nou a cada crida: el cos només es pot llegir una vegada.
    fetchMock.mockImplementation(async () => json({ ok: true, result: true }));

    await sendMessage("token", -1001, "hola");
    const body = bodyOf(fetchMock);
    expect(body).toMatchObject({ chat_id: -1001, text: "hola", parse_mode: "HTML" });
    expect(body.link_preview_options).toEqual({
      is_disabled: false,
      prefer_large_media: true,
    });

    await sendMessage("token", -1001, "text pla", { parse_mode: undefined });
    const plain = bodyOf(fetchMock, 1);
    expect(plain.parse_mode).toBeUndefined();
  });
});

describe("sendTelegramMessage (bot global)", () => {
  it("no fa res si el bot global no està configurat", async () => {
    await sendTelegramMessage("hola");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia el missatge al xat configurat", async () => {
    config.TELEGRAM_BOT_TOKEN = "global-token";
    config.TELEGRAM_CHAT_ID = "-1000";
    fetchMock.mockResolvedValue(json({ ok: true, result: true }));

    await sendTelegramMessage("hola");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://api.telegram.org/botglobal-token/sendMessage");
    expect(bodyOf(fetchMock)).toMatchObject({ chat_id: "-1000", text: "hola" });
  });

  it("empassa errors de Telegram i de xarxa: la notificació és best-effort", async () => {
    config.TELEGRAM_BOT_TOKEN = "global-token";
    config.TELEGRAM_CHAT_ID = "-1000";

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(sendTelegramMessage("hola")).resolves.toBeUndefined();

    fetchMock.mockRejectedValueOnce(new Error("xarxa"));
    await expect(sendTelegramMessage("hola")).resolves.toBeUndefined();
  });
});

describe("sendToAdf", () => {
  it("no fa res si l'ADF no té cap bot configurat", async () => {
    await sendToAdf(ADF_278, "hola");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia al grup configurat", async () => {
    createTelegramBot();
    fetchMock.mockResolvedValue(json({ ok: true, result: true }));

    await sendToAdf(ADF_278, "avís");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("/sendMessage");
    expect(bodyOf(fetchMock)).toMatchObject({ chat_id: 777, text: "avís" });
  });

  it("no envia si el token no es pot desxifrar", async () => {
    createTelegramBot({ token_enc: "això-no-és-un-payload-xifrat" });

    await sendToAdf(ADF_278, "avís");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("empassa els errors de Telegram: una notificació no ha de tombar la petició", async () => {
    createTelegramBot();
    fetchMock.mockRejectedValue(new Error("xarxa"));

    await expect(sendToAdf(ADF_278, "avís")).resolves.toBeUndefined();
  });

  it("ignora els bots que no estan en estat CONFIGURAT", async () => {
    createTelegramBot({ estat: "GRUP_PENDENT", chat_id: null });

    await sendToAdf(ADF_278, "avís");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
