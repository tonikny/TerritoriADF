/**
 * Observabilitat de l'API (V3-14 de l'auditoria v3): el mateix ID de petició
 * viatja a la resposta i al log, i el logger no deixa escapar credencials.
 */
import type { FastifyInstance } from "fastify";
import { pino, type LoggerOptions } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOG_CENSOR, loggerOptions, maskSecretUrl, serializeRequest } from "../src/utils/logger.js";
import { createTestApp } from "./helpers/app.js";

type ErrorBody = { error: string; code: string; requestId: string };

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe("ID de petició", () => {
  it("retorna el mateix ID a la capçalera i al cos de l'error", async () => {
    const response = await app.inject({ method: "GET", url: "/api/no-existeix" });

    const header = response.headers["x-request-id"];
    expect(typeof header).toBe("string");
    expect(response.json<ErrorBody>().requestId).toBe(header);
  });

  it("també surt a una resposta correcta", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toEqual(expect.any(String));
  });

  it("respecta l'ID que envia el client", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/no-existeix",
      headers: { "x-request-id": "prova-client-8f3c1a2b" },
    });

    expect(response.headers["x-request-id"]).toBe("prova-client-8f3c1a2b");
    expect(response.json<ErrorBody>().requestId).toBe("prova-client-8f3c1a2b");
  });

  it("descarta un ID que no encaixa amb el patró i en genera un", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/no-existeix",
      headers: { "x-request-id": "no és un id" },
    });

    expect(response.headers["x-request-id"]).not.toBe("no és un id");
    expect(response.headers["x-request-id"]).toMatch(/^[A-Za-z0-9._-]{8,64}$/);
  });
});

interface Capture {
  text: () => string;
  write: (entry: object) => void;
}

/** Logger amb una configuració donada, però escrivint a memòria. */
function captureWith(options: LoggerOptions): Capture {
  const lines: string[] = [];
  const log = pino(options, {
    write(line: string): void {
      lines.push(line);
    },
  });
  return {
    text: () => lines.join(""),
    write: (entry: object) => log.info(entry, "prova"),
  };
}

/** Només `redact`, sense serializers: així es veuen els objectes tal com arriben. */
function captureRedacted(): Capture {
  return captureWith({ level: "info", redact: loggerOptions.redact });
}

describe("redacció del log", () => {
  it("censura cookies, autoritzacions i secrets plans i niats", () => {
    const capture = captureRedacted();

    capture.write({
      req: {
        headers: { cookie: "auth_token=secret-de-sessió", authorization: "Bearer secret" },
      },
      res: { headers: { "set-cookie": "auth_token=secret-de-sessió" } },
      password: "contrasenya-planera",
      body: { password: "contrasenya-al-cos", token: "token-al-cos" },
      telegram: { bot: { token_enc: "token-xifrat" } },
    });

    const line = capture.text();
    expect(line).toContain(LOG_CENSOR);
    for (const secret of [
      "secret-de-sessió",
      "Bearer secret",
      "contrasenya-planera",
      "contrasenya-al-cos",
      "token-al-cos",
      "token-xifrat",
    ]) {
      expect(line).not.toContain(secret);
    }
  });

  it("censura el secret del webhook de Telegram a les capçaleres", () => {
    const capture = captureRedacted();

    capture.write({
      req: {
        headers: { "x-telegram-bot-api-secret-token": "secret-del-webhook" },
      },
      headers: { "x-telegram-bot-api-secret-token": "secret-del-webhook" },
    });

    expect(capture.text()).toContain(LOG_CENSOR);
    expect(capture.text()).not.toContain("secret-del-webhook");
  });

  it("censura l'enllaç d'accés d'un sol ús", () => {
    const capture = captureRedacted();

    capture.write({
      access_url: "https://territoriadf.example/acces/token-de-prova-arrel",
      user: { access_url: "https://territoriadf.example/acces/token-de-prova-niat" },
    });

    const line = capture.text();
    expect(line).toContain(LOG_CENSOR);
    expect(line).not.toContain("token-de-prova-arrel");
    expect(line).not.toContain("token-de-prova-niat");
  });

  it("no toca els camps que no són secrets", () => {
    const capture = captureRedacted();

    capture.write({ hidrant: "abc123", status: "PENDING_CREATE" });

    expect(capture.text()).toContain("abc123");
    expect(capture.text()).toContain("PENDING_CREATE");
    expect(capture.text()).not.toContain(LOG_CENSOR);
  });
});

describe("camins amb secret", () => {
  it("emmascara el secret del webhook de Telegram a la URL", () => {
    expect(maskSecretUrl("/api/telegram/webhook/secret-del-bot")).toBe(
      `/api/telegram/webhook/${LOG_CENSOR}`,
    );
    expect(maskSecretUrl("/api/telegram/webhook/secret-del-bot?x=1")).toBe(
      `/api/telegram/webhook/${LOG_CENSOR}?x=1`,
    );
  });

  it("deixa iguals els camins que no porten secret", () => {
    for (const url of ["/api/hidrants?adf=278", "/api/telegram/webhook", "/healthz"]) {
      expect(maskSecretUrl(url)).toBe(url);
    }
  });

  it("el serializer de peticions no registra el secret del camí", () => {
    const capture = captureWith({
      level: "info",
      redact: loggerOptions.redact,
      serializers: loggerOptions.serializers,
    });

    capture.write({ req: { method: "POST", url: "/api/telegram/webhook/secret-del-bot" } });

    expect(capture.text()).toContain("/api/telegram/webhook/");
    expect(capture.text()).toContain(LOG_CENSOR);
    expect(capture.text()).not.toContain("secret-del-bot");
  });

  it("el serializer conserva els camps útils de la petició", () => {
    expect(
      serializeRequest({
        method: "GET",
        url: "/api/hidrants?adf=278",
        host: "localhost:3033",
        ip: "127.0.0.1",
        headers: { "accept-version": "1" },
        socket: { remotePort: 1234 },
      }),
    ).toEqual({
      method: "GET",
      url: "/api/hidrants?adf=278",
      version: "1",
      host: "localhost:3033",
      remoteAddress: "127.0.0.1",
      remotePort: 1234,
    });
  });
});
