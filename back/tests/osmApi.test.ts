import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as osmApi from "../src/services/osmApi.js";
import { config } from "../src/utils/config.js";

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isConfigured", () => {
  it("reflecteix si hi ha un token a la configuració", () => {
    // No fixem el valor: depèn de l'entorn on es corri la suite.
    expect(osmApi.isConfigured()).toBe(Boolean(config.OSM_ACCESS_TOKEN));
  });
});

describe("createChangeset i createNode", () => {
  it("crea un changeset i en retorna l'ID", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("123"));

    const id = await osmApi.createChangeset("TerritoriADF: alta");

    expect(id).toBe(123);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.OSM_API_URL}/changeset/create`);
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toContain("Bearer");
    expect(init.body).toContain("<changeset>");
  });

  it("llança un error si el changeset falla", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("forbidden", 403));

    await expect(osmApi.createChangeset("x")).rejects.toThrow("Error creant changeset: 403");
  });

  it("crea un node i en retorna l'ID i la versió", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("9001"));

    const result = await osmApi.createNode(41.6, 1.6, { emergency: "fire_hydrant" }, 123);

    expect(result).toEqual({ osmId: 9001, newVersion: 1 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${config.OSM_API_URL}/nodes`);
    expect(init.method).toBe("POST");
    expect(init.body).toContain("<node");
  });

  it("llança un error si la creació del node falla", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("bad request", 400));

    await expect(osmApi.createNode(41.6, 1.6, {}, 123)).rejects.toThrow("Error creant node: 400");
  });
});

describe("updateNode", () => {
  it("retorna la versió nova en un 200", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("5"));

    const result = await osmApi.updateNode(7001, 3, 41.6, 1.6, {}, 123);

    expect(result).toEqual({ ok: true, status: 200, data: "5" });
  });

  it("retorna el text d'error en un 400", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("invalid tag", 400));

    const result = await osmApi.updateNode(7001, 3, 41.6, 1.6, {}, 123);

    expect(result).toEqual({ ok: false, status: 400, error: "invalid tag" });
  });

  it("en un 409 carrega l'estat actual d'OSM i el retorna com a conflicte", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("version mismatch", 409)).mockResolvedValueOnce(
      jsonResponse({
        elements: [
          {
            type: "node",
            id: 7001,
            version: 5,
            lat: 41.7,
            lon: 1.7,
            tags: { "addr:street": "Carrer OSM" },
          },
        ],
      }),
    );

    const result = await osmApi.updateNode(7001, 3, 41.6, 1.6, {}, 123);

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      osmVersion: 5,
      osmLat: 41.7,
      osmLon: 1.7,
      osmTags: { "addr:street": "Carrer OSM" },
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/node/7001");
  });

  it("en un 409 sense dades d'OSM retorna un error de conflicte", async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse("version mismatch", 409))
      .mockResolvedValueOnce(textResponse("gone", 404));

    const result = await osmApi.updateNode(7001, 3, 41.6, 1.6, {}, 123);

    expect(result).toEqual({ ok: false, status: 409, error: "409 Sense dades d'OSM" });
  });
});

describe("deleteNode", () => {
  it("retorna ok en un 200", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(""));

    const result = await osmApi.deleteNode(7001, 3, 123);

    expect(result).toEqual({ ok: true, status: 200, data: "" });
  });

  it("retorna el conflicte si la versió ha canviat", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("conflict", 409)).mockResolvedValueOnce(
      jsonResponse({
        elements: [{ id: 7001, version: 6, lat: 41.7, lon: 1.7, tags: {} }],
      }),
    );

    const result = await osmApi.deleteNode(7001, 3, 123);
    expect(result).toMatchObject({ ok: false, status: 409, osmVersion: 6 });
  });

  it("retorna el text d'error en un 500", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("server error", 500));

    const result = await osmApi.deleteNode(7001, 3, 123);
    expect(result).toEqual({ ok: false, status: 500, error: "server error" });
  });
});

describe("getNode", () => {
  it("retorna el node amb la seva versió i tags", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        elements: [
          {
            type: "node",
            id: 7001,
            version: 7,
            lat: 41.7,
            lon: 1.7,
            tags: { emergency: "fire_hydrant" },
          },
        ],
      }),
    );

    const node = await osmApi.getNode(7001);

    expect(node).toEqual({
      version: 7,
      lat: 41.7,
      lon: 1.7,
      tags: { emergency: "fire_hydrant" },
    });
  });

  it("retorna null si el node no existeix o la resposta no és JSON", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("not found", 404));
    expect(await osmApi.getNode(7001)).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ elements: [] }));
    expect(await osmApi.getNode(7001)).toBeNull();

    fetchMock.mockResolvedValueOnce(textResponse("<html>maintenance</html>", 200));
    expect(await osmApi.getNode(7001)).toBeNull();
  });

  it("retorna null si fetch falla", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    expect(await osmApi.getNode(7001)).toBeNull();
  });
});

describe("closeChangeset", () => {
  it("no llança si OSM respon amb error", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("error", 500));

    await expect(osmApi.closeChangeset(123)).resolves.toBeUndefined();
  });
});
