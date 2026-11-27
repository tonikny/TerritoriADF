import { describe, expect, it, vi, afterEach } from "vitest";
import { ApiError, buildUrl, request } from "./client";

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client d'API", () => {
  it("serialitza la query i omet els valors buits", () => {
    expect(
      buildUrl("/api/incidencies", { adf: 278, incloure_tancades: undefined, valor: null }),
    ).toBe("/api/incidencies?adf=278");
    expect(buildUrl("/api/incidencies")).toBe("/api/incidencies");
  });

  it("envia el cos com a JSON amb credencials de sessió", async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ id: "node-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await request<{ id: string }>("/api/hidrants", {
      method: "POST",
      query: { adf: 278 },
      body: { lat: 41.5, lon: 2.3 },
    });

    expect(result).toEqual({ id: "node-1" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/hidrants?adf=278");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe(JSON.stringify({ lat: 41.5, lon: 2.3 }));
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("converteix una resposta d'error en ApiError amb estat, codi i requestId", async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          error: "Fora de l'abast de l'ADF",
          code: "ADF_FORBIDDEN",
          requestId: "req-42",
        }),
        { status: 403, statusText: "Forbidden" },
      ),
    );

    const error = await request("/api/hidrants", { query: { adf: 1 } }).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: "ADF_FORBIDDEN",
      requestId: "req-42",
      message: "Fora de l'abast de l'ADF",
    });
  });

  it("retorna undefined en una resposta 204", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(request("/api/hidrants/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("propaga l'AbortSignal a fetch", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ features: [] }), { status: 200 }));
    const controller = new AbortController();

    await request("/api/hidrants", { query: { adf: 278 }, signal: controller.signal });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
