// Notificacions d'hidrant a Telegram: permís calculat a partir del cos, abast
// ADF, límit de mida, fre anti-spam i que un error de Telegram no tombi la UX.
// El bot global es mockeja (no és l'objecte del test); el de l'ADF és real i
// passa pel stub de `fetch`.
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { notificationPermission } from "../src/routes/sendToTelegram.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import { ADF_278, ADF_279, createUser, resetWorld } from "./helpers/db.js";
import {
  callsTo,
  createTelegramBot,
  telegramFetch,
  type TelegramFetch,
} from "./helpers/telegram.js";

const globalTelegram = vi.hoisted(() => ({ sendTelegramMessage: vi.fn() }));
vi.mock("../src/utils/telegram.js", () => globalTelegram);

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let volontariCookie: string;
let fetchMock: TelegramFetch;

const BASE = { lat: 41.6, lon: 1.6, adf_id: ADF_278, action: "create", tags: {} };

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
  // Bot de l'ADF 278 vinculat al grup 777 (el que ha de rebre les notificacions).
  createTelegramBot({ id: "bot-278" });
  vi.clearAllMocks();
  globalTelegram.sendTelegramMessage.mockResolvedValue(undefined);
  fetchMock = telegramFetch();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function notify(payload: Record<string, unknown>, cookie = volontariCookie) {
  return app.inject({
    method: "POST",
    url: "/api/sendToTelegram",
    headers: { cookie },
    payload,
  });
}

describe("notificationPermission", () => {
  it("dedueix la capacitat de l'acció del cos", () => {
    expect(notificationPermission({ action: "delete" })).toBe("delete_hydrant");
    expect(notificationPermission({ action: "create" })).toBe("create_hydrant");
    expect(notificationPermission({ isEdit: true })).toBe("edit_hydrant");
    expect(notificationPermission({})).toBe("create_hydrant");
  });

  it("deixa passar un hidrant existent sense acció (el handler el rebutja)", () => {
    expect(notificationPermission({ tags: { id: "h1" } })).toBeNull();
    expect(notificationPermission({ tags: { osm_id: 9001 } })).toBeNull();
  });
});

describe("POST /api/sendToTelegram", () => {
  it("requereix sessió", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/sendToTelegram",
      payload: BASE,
    });

    expect(response.statusCode).toBe(401);
    expect(globalTelegram.sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("notifica al bot global i al grup de l'ADF", async () => {
    const response = await notify(BASE);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(globalTelegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining("278/002"),
    );

    const [message] = callsTo(fetchMock, "sendMessage");
    expect(message!.body.chat_id).toBe(777);
    expect(String(message!.body.text)).toContain("Nou Hidrant");
  });

  it("no deixa notificar una altra ADF", async () => {
    const response = await notify({ ...BASE, adf_id: ADF_279 });

    expect(response.statusCode).toBe(403);
    expect(globalTelegram.sendTelegramMessage).not.toHaveBeenCalled();
    expect(callsTo(fetchMock, "sendMessage")).toHaveLength(0);
  });

  it("exigeix el permís de l'acció (un voluntari no pot notificar esborrats)", async () => {
    const response = await notify({ ...BASE, action: "delete" });

    expect(response.statusCode).toBe(403);
  });

  it("una edició la pot notificar el coordinador i porta el títol d'edició", async () => {
    const response = await notify(
      { ...BASE, isEdit: true, action: undefined, originalData: { a: 1 }, changes: { a: 2 } },
      coord278Cookie,
    );

    expect(response.statusCode).toBe(200);
    expect(globalTelegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining("Edició d'hidrant"),
    );
    expect(globalTelegram.sendTelegramMessage).toHaveBeenCalledWith(
      expect.stringContaining("Canvis aplicats"),
    );
  });

  it("rebutja el camí de comentari lliure sobre un node existent", async () => {
    const response = await notify({ ...BASE, action: undefined, tags: { id: "h1" } });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe("Ús no permès");
  });

  it("rebutja dades estructurades massa grans", async () => {
    const response = await notify({ ...BASE, tags: { blob: "x".repeat(11_000) } });

    expect(response.statusCode).toBe(413);
  });

  it("un error del grup de l'ADF no tomba la notificació global", async () => {
    fetchMock.mockRejectedValue(new Error("Telegram cau"));

    const response = await notify(BASE, adminCookie);

    expect(response.statusCode).toBe(200);
    expect(globalTelegram.sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it("aplica el fre anti-spam per usuari amb Retry-After", async () => {
    createUser({ id: "user-spam", username: "278/003", role: "voluntari", adfId: ADF_278 });
    const cookie = await loginCookie(app, "278/003");

    for (let i = 0; i < 15; i++) {
      expect((await notify(BASE, cookie)).statusCode).toBe(200);
    }

    const limited = await notify(BASE, cookie);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
  });
});
