/**
 * Contracte d'error de l'API: tota resposta ≥ 400 surt amb la mateixa forma
 * `{ error, code, requestId }`, i el `code` identifica el cas sense dependre
 * del text (V3-05 de l'auditoria v3).
 *
 * Els identificadors són en anglès, però els noms del domini es queden en
 * català: `HIDRANT_NOT_FOUND`, `INCIDENCIA_NOT_FOUND`, `ADF_FORBIDDEN`.
 */
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp, login, loginCookie } from "./helpers/app.js";
import { resetWorld } from "./helpers/db.js";

type ApiErrorBody = { error: string; code: string; requestId: string };

let app: FastifyInstance;
let voluntariCookie: string;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  resetWorld();
  voluntariCookie = await loginCookie(app, "278/002");
});

describe("contracte d'error", () => {
  it("completa code i requestId en una resposta que el handler envia directament", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "278/001" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorBody>()).toMatchObject({
      error: "Falten credencials",
      code: "BAD_REQUEST",
    });
    expect(response.json<ApiErrorBody>().requestId).toEqual(expect.any(String));
  });

  it("la validació d'esquema és VALIDATION_ERROR", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: 123 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorBody>().code).toBe("VALIDATION_ERROR");
  });

  it("les credencials incorrectes són INVALID_CREDENTIALS", async () => {
    const response = await login(app, "278/001", "Incorrecta123");

    expect(response.statusCode).toBe(401);
    expect(response.json<ApiErrorBody>().code).toBe("INVALID_CREDENTIALS");
  });

  it("una sessió absent és SESSION_EXPIRED", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/auth/password",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json<ApiErrorBody>().code).toBe("SESSION_EXPIRED");
  });

  it("un hidrant inexistent és HIDRANT_NOT_FOUND", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/api/hidrants/no-existeix?adf=278",
      headers: { cookie: voluntariCookie },
      payload: { lat: 41.6, lon: 1.6 },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().code).toBe("HIDRANT_NOT_FOUND");
  });

  it("una incidència inexistent és INCIDENCIA_NOT_FOUND", async () => {
    const response = await app.inject({ method: "GET", url: "/api/incidencies/no-existeix" });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().code).toBe("INCIDENCIA_NOT_FOUND");
  });

  it("una mutació sobre una altra ADF és ADF_FORBIDDEN", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/hidrants?adf=279",
      headers: { cookie: voluntariCookie },
      payload: { lat: 41.61, lon: 1.61 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorBody>().code).toBe("ADF_FORBIDDEN");
  });

  it("una ruta desconeguda és NOT_FOUND", async () => {
    const response = await app.inject({ method: "GET", url: "/api/no-existeix" });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorBody>().code).toBe("NOT_FOUND");
    expect(response.json<ApiErrorBody>().requestId).toEqual(expect.any(String));
  });

  it("un mètode no permès és METHOD_NOT_ALLOWED", async () => {
    const response = await app.inject({ method: "DELETE", url: "/api/hidrants?adf=278" });

    expect(response.statusCode).toBe(405);
    expect(response.json<ApiErrorBody>().code).toBe("METHOD_NOT_ALLOWED");
  });
});
