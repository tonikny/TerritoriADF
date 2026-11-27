import { describe, expect, it, vi, afterEach } from "vitest";
import { ApiError, apiErrorMessage, buildUrl, request } from "./client";

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
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("envia un ID de petició i el conserva a l'ApiError", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-de-prova-1234" });
    const fetchMock = stubFetch(new Response("no és JSON", { status: 500 }));

    const error = await request("/api/hidrants").catch((err: unknown) => err);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "x-request-id": "uuid-de-prova-1234" });
    expect(error).toMatchObject({ status: 500, requestId: "uuid-de-prova-1234" });
  });

  it("agafa el requestId de la capçalera si el cos no en porta", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: "Bad Gateway" }), {
        status: 502,
        headers: { "x-request-id": "req-proxy-99" },
      }),
    );

    const error = await request("/api/hidrants").catch((err: unknown) => err);

    expect(error).toMatchObject({ status: 502, requestId: "req-proxy-99" });
  });

  it("afegeix la referència de la petició al missatge d'error", () => {
    const error = new ApiError("Fora de l'abast", 403, "ADF_FORBIDDEN", "8f3c1a2b-0000-4000");

    expect(apiErrorMessage(error)).toBe("Fora de l'abast (ref. 8f3c1a2b)");
    expect(apiErrorMessage(new ApiError("Sense ID", 500))).toBe("Sense ID");
    expect(apiErrorMessage(new Error("xarxa"), "No hi ha connexió")).toBe("No hi ha connexió");
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
