// Fre anti-spam de les notificacions: finestra lliscant per usuari i, només si
// la IP és fiable (TRUST_PROXY), per IP. El Map és en memòria, així que el test
// controla el rellotge per provar la caducitat.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerTelegramHit, telegramBlock } from "../src/services/telegramThrottle.js";
import { config } from "../src/utils/config.js";

const WINDOW_MS = 5 * 60 * 1000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
  config.TRUST_PROXY = false;
});

afterEach(() => {
  vi.useRealTimers();
  config.TRUST_PROXY = false;
});

describe("telegramBlock", () => {
  it("deixa passar fins a 15 notificacions per usuari i llavors bloqueja", () => {
    // Les 15 primeres passen; la setzena ja no.
    for (let i = 0; i < 15; i++) {
      expect(telegramBlock("user-a")).toBeNull();
      registerTelegramHit("user-a");
    }

    const blocked = telegramBlock("user-a");
    expect(blocked?.error).toContain("Massa notificacions");
    expect(blocked?.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked?.retryAfterSeconds).toBeLessThanOrEqual(300);
  });

  it("torna a permetre quan la finestra caduca", () => {
    for (let i = 0; i < 16; i++) {
      registerTelegramHit("user-b");
    }
    expect(telegramBlock("user-b")).not.toBeNull();

    vi.advanceTimersByTime(WINDOW_MS + 1000);

    expect(telegramBlock("user-b")).toBeNull();
  });

  it("no compta per IP si TRUST_PROXY està desactivat", () => {
    // 60 notificacions (el límit d'IP) repartides entre 4 usuaris: cap usuari
    // arriba al seu límit, però la IP sí que arribaria al seu.
    for (let i = 0; i < 60; i++) {
      registerTelegramHit(`user-ip-${i % 4}`, "203.0.113.7");
    }

    expect(telegramBlock("usuari-nou", "203.0.113.7")).toBeNull();
  });

  it("limita per IP quan TRUST_PROXY està activat", () => {
    config.TRUST_PROXY = true;
    for (let i = 0; i < 60; i++) {
      registerTelegramHit(`user-shared-${i % 4}`, "203.0.113.9");
    }

    const blocked = telegramBlock("un-altre-usuari", "203.0.113.9");
    expect(blocked?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("una IP no afecta usuaris d'una altra IP", () => {
    config.TRUST_PROXY = true;
    for (let i = 0; i < 60; i++) {
      registerTelegramHit(`user-x-${i % 3}`, "203.0.113.10");
    }

    expect(telegramBlock("usuari-diferent", "198.51.100.1")).toBeNull();
  });

  it("sense usuari ni IP fiable no hi ha res a comptar", () => {
    expect(telegramBlock(undefined, "203.0.113.11")).toBeNull();
    registerTelegramHit(undefined, "203.0.113.11");
    expect(telegramBlock(undefined, "203.0.113.11")).toBeNull();
  });
});
