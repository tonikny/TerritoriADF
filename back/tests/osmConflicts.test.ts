import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as osmApi from "../src/services/osmApi.js";
import { queryOverpass } from "../src/services/overpass.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import type { HidrantFeatures } from "./helpers/types.js";
import { createHydrant, FULL_OSM_TAGS, resetDatabase, seedStandardWorld } from "./helpers/db.js";

vi.mock("../src/services/osmApi.js", () => ({
  isConfigured: vi.fn(() => true),
  createChangeset: vi.fn(async () => 4242),
  closeChangeset: vi.fn(async () => undefined),
  createNode: vi.fn(async () => ({ osmId: 9001, newVersion: 1 })),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  getNode: vi.fn(),
}));

vi.mock("../src/services/overpass.js", () => ({
  queryOverpass: vi.fn(),
}));

const LOCAL_TAGS = { ...FULL_OSM_TAGS, "addr:street": "Carrer Local" };
const REMOTE_TAGS = { ...FULL_OSM_TAGS, "addr:street": "Carrer OSM" };

const CONFLICT_ERROR = {
  localVersion: 3,
  osmVersion: 4,
  osmLat: 41.6005,
  osmLon: 1.6005,
  osmTags: REMOTE_TAGS,
  localLat: 41.6,
  localLon: 1.6,
  localTags: LOCAL_TAGS,
  diffFields: ["addr:street"],
};

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;

function seedConflict(id = "conflict-1"): void {
  createHydrant({
    id,
    osm_id: 7001,
    osm_version: 3,
    sync_status: "CONFLICT",
    osm_tags: JSON.stringify(LOCAL_TAGS),
    sync_error: JSON.stringify(CONFLICT_ERROR),
  });
}

beforeAll(async () => {
  app = await createTestApp();
  resetDatabase();
  seedStandardWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  seedStandardWorld();
  vi.clearAllMocks();
  vi.mocked(osmApi.getNode).mockReset();
  vi.mocked(queryOverpass).mockReset();
});

describe("GET /api/osm/conflicts", () => {
  it("retorna els conflictes amb el diff recalculat", async () => {
    seedConflict();

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/conflicts",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const conflicts = response.json<Array<{ hidrant: { id: string }; diffFields: string[] }>>();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.hidrant.id).toBe("conflict-1");
    expect(conflicts[0]!.diffFields.join(" ")).toContain("addr:street");
  });

  it("retorna 401 sense sessió i 403 per a un coordinador", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/osm/conflicts" });
    expect(anonymous.statusCode).toBe(401);

    const coordinator = await app.inject({
      method: "GET",
      url: "/api/osm/conflicts",
      headers: { cookie: coord278Cookie },
    });
    expect(coordinator.statusCode).toBe(403);
  });
});

describe("GET /api/osm/conflicts/osc", () => {
  it("genera un fitxer .osc amb els conflictes", async () => {
    seedConflict();

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/conflicts/osc",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");
    expect(response.body).toContain("<osmChange");
    expect(response.body).toContain("7001");
    expect(response.body).toContain("Carrer Local");
  });

  it("retorna un missatge si no hi ha conflictes", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/osm/conflicts/osc",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ message: string }>()).toEqual({
      message: "No hi ha conflictes per exportar",
    });
  });
});

describe("POST /api/osm/conflicts/resolve", () => {
  it("aplica la versió d'OSM i marca el conflicte com a resolt", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue({
      version: 5,
      lat: 41.6005,
      lon: 1.6005,
      tags: REMOTE_TAGS,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/conflicts/resolve",
      headers: { cookie: adminCookie },
      payload: { id: "conflict-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ resolved: boolean }>()).toEqual({ resolved: true });

    const detail = await app.inject({
      method: "GET",
      url: "/api/hidrants?adf=278",
      headers: { cookie: adminCookie },
    });
    const properties = detail.json<HidrantFeatures>().features[0]!.properties;
    expect(properties.sync_status).toBe("SYNCED");
    expect(properties.osm_tags?.["addr:street"]).toBe("Carrer OSM");
  });

  it("retorna resolved:false si OSM no retorna el node", async () => {
    seedConflict();
    vi.mocked(osmApi.getNode).mockResolvedValue(null);

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/conflicts/resolve",
      headers: { cookie: adminCookie },
      payload: { id: "conflict-1" },
    });

    expect(response.json<{ resolved: boolean }>()).toEqual({ resolved: false });
  });

  it("retorna 400 sense id i 403 per a un coordinador", async () => {
    const missing = await app.inject({
      method: "POST",
      url: "/api/osm/conflicts/resolve",
      headers: { cookie: adminCookie },
      payload: {},
    });
    expect(missing.statusCode).toBe(400);

    const forbidden = await app.inject({
      method: "POST",
      url: "/api/osm/conflicts/resolve",
      headers: { cookie: coord278Cookie },
      payload: { id: "conflict-1" },
    });
    expect(forbidden.statusCode).toBe(403);
  });
});

describe("GET /api/osm/reviews", () => {
  it("llista els hidrants en REVIEW amb els seus problemes", async () => {
    createHydrant({
      id: "review-1",
      sync_status: "REVIEW",
      sync_error: JSON.stringify([
        { tag: "addr:street", level: "warning", message: "text en majúscules" },
      ]),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/reviews",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      count: number;
      reviews: Array<{ sync_error: Array<{ tag: string }> }>;
    }>();
    expect(body.count).toBe(1);
    expect(body.reviews[0]!.sync_error[0]!.tag).toBe("addr:street");
  });
});

describe("GET /api/osm/diff/:id", () => {
  it("retorna el diff d'un conflicte a partir de sync_error", async () => {
    seedConflict();

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/diff/conflict-1",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const diff = response.json<{
      diff: { osmTags: Record<string, string>; remoteOsmTags: Record<string, string> };
    }>().diff;
    expect(diff.osmTags["addr:street"]).toBe("Carrer Local");
    expect(diff.remoteOsmTags["addr:street"]).toBe("Carrer OSM");
  });

  it("retorna el diff des de remote_osm_tags si no és un conflicte", async () => {
    createHydrant({
      id: "remote-only",
      osm_id: 7100,
      sync_status: "PENDING_UPDATE",
      osm_tags: JSON.stringify(LOCAL_TAGS),
      remote_osm_tags: JSON.stringify(REMOTE_TAGS),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/diff/remote-only",
      headers: { cookie: adminCookie },
    });

    expect(
      response.json<{ diff: { remoteOsmTags: Record<string, string> } }>().diff.remoteOsmTags[
        "addr:street"
      ],
    ).toBe("Carrer OSM");
  });

  it("retorna diff null si l'hidrant no té osm_id", async () => {
    createHydrant({ id: "no-osm-id" });

    const response = await app.inject({
      method: "GET",
      url: "/api/osm/diff/no-osm-id",
      headers: { cookie: adminCookie },
    });

    expect(response.json<{ diff: null }>()).toEqual({ diff: null });
  });

  it("retorna 400 si l'hidrant no existeix", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/osm/diff/unknown",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("POST /api/osm/pull-hydrant", () => {
  it("aplica el node d'Overpass al hidrant", async () => {
    seedConflict();
    vi.mocked(queryOverpass).mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        elements: [
          {
            id: 7001,
            version: 9,
            lat: 41.6005,
            lon: 1.6005,
            timestamp: "2026-02-01T10:00:00Z",
            tags: REMOTE_TAGS,
          },
        ],
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: adminCookie },
      payload: { id: "conflict-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ success: boolean }>()).toEqual({ success: true });

    const detail = await app.inject({
      method: "GET",
      url: "/api/hidrants?adf=278",
      headers: { cookie: adminCookie },
    });
    const properties = detail.json<HidrantFeatures>().features[0]!.properties;
    expect(properties.sync_status).toBe("SYNCED");
    expect(properties.osm_tags?.["addr:street"]).toBe("Carrer OSM");
  });

  it("retorna 400 si Overpass no troba el node", async () => {
    seedConflict();
    vi.mocked(queryOverpass).mockResolvedValue({ ok: true, status: 200, data: { elements: [] } });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: adminCookie },
      payload: { id: "conflict-1" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 si l'hidrant no existeix", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: adminCookie },
      payload: { id: "unknown" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 si l'hidrant no té osm_id", async () => {
    createHydrant({ id: "no-osm-id" });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: adminCookie },
      payload: { id: "no-osm-id" },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 sense id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 403 per a un coordinador", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/pull-hydrant",
      headers: { cookie: coord278Cookie },
      payload: { id: "conflict-1" },
    });

    expect(response.statusCode).toBe(403);
  });
});
