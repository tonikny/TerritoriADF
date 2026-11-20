import { afterEach, describe, expect, it, vi } from "vitest";

import { queryOverpass } from "../src/services/overpass.js";
import { config } from "../src/utils/config.js";
import { overpassFixtureData } from "./helpers/osm.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queryOverpass", () => {
  it("fa POST a Overpass, envia el User-Agent i retorna el JSON", async () => {
    const fixture = overpassFixtureData("overpass-hydrants.json");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await queryOverpass("[out:json];node(1);out;");

    expect(result).toEqual({ ok: true, status: 200, data: fixture });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(config.OVERPASS_URL);
    expect(init.method).toBe("POST");
    expect(init.body).toBe("[out:json];node(1);out;");
    expect((init.headers as Record<string, string>)["User-Agent"]).toContain("TerritoriADF");
    expect(init.signal).toBeDefined();
  });

  it("retorna l'status i el text quan Overpass respon amb error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 429 })),
    );

    const result = await queryOverpass("[out:json];node(1);out;");

    expect(result).toEqual({ ok: false, status: 429, error: "quota exceeded" });
  });
});
