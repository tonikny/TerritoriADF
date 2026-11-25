// Rutes (GraphHopper): validació de coordenades, clau absent i traducció
// d'errors upstream. `fetch` es mockeja; la suite no surt a la xarxa.
import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestApp, loginCookie } from "./helpers/app.js";
import { resetWorld } from "./helpers/db.js";
import { config } from "../src/utils/config.js";

let app: FastifyInstance;
let adminCookie: string;
const fetchMock = vi.fn();
let originalKey: string | undefined;

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
  originalKey = config.GRAPHHOPPER_API_KEY;
});

afterAll(async () => {
  config.GRAPHHOPPER_API_KEY = originalKey;
  vi.unstubAllGlobals();
  await app.close();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  config.GRAPHHOPPER_API_KEY = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function get(url: string) {
  return app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
}

describe("GET /api/route", () => {
  it("requereix sessió", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/route?from=41.5,2.1&to=41.6,2.2",
    });

    expect(response.statusCode).toBe(401);
  });

  it("exigeix les dues coordenades en format lat,lon", async () => {
    expect((await get("/api/route")).statusCode).toBe(400);
    expect((await get("/api/route?from=41.5,2.1")).statusCode).toBe(400);
    expect((await get("/api/route?from=abc&to=41.6,2.2")).statusCode).toBe(400);
    expect((await get("/api/route?from=91,2.1&to=41.6,2.2")).statusCode).toBe(400);
    expect((await get("/api/route?from=41.5,181&to=41.6,2.2")).statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna 503 si no hi ha clau de GraphHopper", async () => {
    const response = await get("/api/route?from=41.5,2.1&to=41.6,2.2");

    expect(response.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retorna la ruta de GraphHopper amb els punts i la clau", async () => {
    config.GRAPHHOPPER_API_KEY = "test-key";
    const body = { paths: [{ distance: 1200 }] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    const response = await get("/api/route?from=41.5,2.1&to=41.6,2.2");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(body);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("graphhopper.com/api/1/route");
    expect(url).toContain("point=41.5%2C2.1");
    expect(url).toContain("point=41.6%2C2.2");
    expect(url).toContain("vehicle=car");
    expect(url).toContain("key=test-key");
  });

  it("retorna 502 si GraphHopper respon error o no és JSON", async () => {
    config.GRAPHHOPPER_API_KEY = "test-key";

    fetchMock.mockResolvedValueOnce(new Response("fora de servei", { status: 500 }));
    expect((await get("/api/route?from=41.5,2.1&to=41.6,2.2")).statusCode).toBe(502);

    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect((await get("/api/route?from=41.5,2.1&to=41.6,2.2")).statusCode).toBe(502);
  });

  it("retorna 500 si la crida falla", async () => {
    config.GRAPHHOPPER_API_KEY = "test-key";
    fetchMock.mockRejectedValue(new Error("timeout"));

    const response = await get("/api/route?from=41.5,2.1&to=41.6,2.2");

    expect(response.statusCode).toBe(500);
  });
});
