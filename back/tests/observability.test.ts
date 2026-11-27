/**
 * Observabilitat de l'API (V3-14 de l'auditoria v3): el mateix ID de petició
 * viatja a la resposta i al log, i el logger no deixa escapar credencials.
 */
import type { FastifyInstance } from "fastify";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOG_CENSOR, LOG_REDACT_PATHS } from "../src/utils/logger.js";
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

describe("redacció del log", () => {
  /** Logger amb les mateixes regles de redacció, però escrivint a memòria. */
  function captureLogs(): { text: () => string; write: (entry: object) => void } {
    const lines: string[] = [];
    const log = pino(
      { level: "info", redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_CENSOR } },
      {
        write(line: string): void {
          lines.push(line);
        },
      },
    );
    return {
      text: () => lines.join(""),
      write: (entry: object) => log.info(entry, "prova"),
    };
  }

  it("censura cookies, autoritzacions i secrets plans i niats", () => {
    const capture = captureLogs();

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

  it("no toca els camps que no són secrets", () => {
    const capture = captureLogs();

    capture.write({ hidrant: "abc123", status: "PENDING_CREATE" });

    expect(capture.text()).toContain("abc123");
    expect(capture.text()).toContain("PENDING_CREATE");
    expect(capture.text()).not.toContain(LOG_CENSOR);
  });
});
