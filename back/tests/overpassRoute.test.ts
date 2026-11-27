// Proxy d'Overpass: només lectura JSON i només amb sessió. El client d'Overpass
// es mockeja (la suite no surt a la xarxa); el que es prova és la frontera.
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as overpass from "../src/services/overpass.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import { resetWorld } from "./helpers/db.js";

vi.mock("../src/services/overpass.js", () => ({ queryOverpass: vi.fn() }));

let app: FastifyInstance;
let adminCookie: string;

const VALID_QUERY = "[out:json];\nnode(1);\nout;";

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.mocked(overpass.queryOverpass).mockReset();
});

function post(body: unknown, cookie = adminCookie) {
  return app.inject({
    method: "POST",
    url: "/api/overpass",
    headers: { cookie },
    payload: body as Record<string, unknown>,
  });
}

describe("POST /api/overpass", () => {
  it("requereix sessió", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/overpass",
      payload: { query: VALID_QUERY },
    });

    expect(response.statusCode).toBe(401);
    expect(overpass.queryOverpass).not.toHaveBeenCalled();
  });

  it("rebutja un Content-Type que no sigui JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/overpass",
      headers: { cookie: adminCookie, "content-type": "text/plain" },
      payload: VALID_QUERY,
    });

    expect(response.statusCode).toBe(415);
  });

  it("rebutja una consulta absent, curta o que no és de lectura JSON", async () => {
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ query: "curta" })).statusCode).toBe(400);
    expect((await post({ query: "[out:xml];node(1);out;" })).statusCode).toBe(400);
    expect((await post({ query: 42 })).statusCode).toBe(400);
    expect(overpass.queryOverpass).not.toHaveBeenCalled();
  });

  it("retorna el JSON d'Overpass amb la consulta normalitzada", async () => {
    const data = {
      elements: [
        { type: "node", id: 1, lat: 41.5, lon: 2.1, version: 1, timestamp: "2026-01-01T00:00:00Z" },
      ],
    };
    vi.mocked(overpass.queryOverpass).mockResolvedValue({ ok: true, status: 200, data });

    const response = await post({ query: "[out:json];\r\nnode(1);\r\nout;" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(data);
    // Els `\r` s'eliminen abans d'enviar la consulta a Overpass.
    expect(overpass.queryOverpass).toHaveBeenCalledWith(
      "[out:json];\nnode(1);\nout;",
      expect.any(AbortSignal),
    );
  });

  it("propaga el 429 d'Overpass i converteix la resta d'errors en 502", async () => {
    vi.mocked(overpass.queryOverpass).mockResolvedValueOnce({
      ok: false,
      status: 429,
      error: "Too Many Requests",
    });
    expect((await post({ query: VALID_QUERY })).statusCode).toBe(429);

    vi.mocked(overpass.queryOverpass).mockResolvedValueOnce({
      ok: false,
      status: 504,
      error: "Gateway Timeout",
    });
    expect((await post({ query: VALID_QUERY })).statusCode).toBe(502);
  });

  it("retorna 500 si el client d'Overpass llança", async () => {
    vi.mocked(overpass.queryOverpass).mockRejectedValue(new Error("boom"));

    const response = await post({ query: VALID_QUERY });

    expect(response.statusCode).toBe(500);
    expect(response.json<{ code: string }>().code).toBe("INTERNAL_ERROR");
  });
});
