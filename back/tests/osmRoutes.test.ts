import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { HidrantsRepository } from "../src/db/repositories/hidrantsRepository.js";
import * as osmApi from "../src/services/osmApi.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import type { HidrantFeatures } from "./helpers/types.js";
import { ADF_278, ADF_279, createHydrant, FULL_OSM_TAGS, resetWorld } from "./helpers/db.js";

vi.mock("../src/services/osmApi.js", () => ({
  isConfigured: vi.fn(() => true),
  createChangeset: vi.fn(async () => 4242),
  closeChangeset: vi.fn(async () => undefined),
  createNode: vi.fn(async () => ({ osmId: 9001, newVersion: 1 })),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  getNode: vi.fn(async () => null),
}));

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetWorld();
  vi.clearAllMocks();

  vi.mocked(osmApi.isConfigured).mockReturnValue(true);
  vi.mocked(osmApi.createChangeset).mockResolvedValue(4242);
  vi.mocked(osmApi.closeChangeset).mockResolvedValue(undefined);
  vi.mocked(osmApi.createNode).mockResolvedValue({ osmId: 9001, newVersion: 1 });
  vi.mocked(osmApi.updateNode).mockReset();
  vi.mocked(osmApi.deleteNode).mockReset();
});

describe("GET /api/osm/status", () => {
  it("retorna comptadors reals i els filtra per ADF", async () => {
    createHydrant({ id: "s-create", sync_status: "PENDING_CREATE" });
    createHydrant({ id: "s-update", sync_status: "PENDING_UPDATE", osm_id: 1, osm_version: 1 });
    createHydrant({ id: "s-synced", sync_status: "SYNCED" });
    createHydrant({ id: "s-conflict", sync_status: "CONFLICT", osm_id: 2, osm_version: 1 });
    createHydrant({ id: "s-279", adf_id: ADF_279, sync_status: "PENDING_CREATE" });

    type StatusBody = { configured: boolean; conflictCount: number; stats: Record<string, number> };

    const global = await app.inject({
      method: "GET",
      url: "/api/osm/status",
      headers: { cookie: adminCookie },
    });

    expect(global.statusCode).toBe(200);
    const everyAdf = global.json<StatusBody>();
    expect(everyAdf.configured).toBe(true);
    expect(everyAdf.conflictCount).toBe(1);
    expect(everyAdf.stats.PENDING_CREATE).toBe(2);
    expect(everyAdf.stats.PENDING_UPDATE).toBe(1);
    expect(everyAdf.stats.SYNCED).toBe(1);
    expect(everyAdf.stats.total_pending).toBe(3);

    const ownAdf = await app.inject({
      method: "GET",
      url: `/api/osm/status?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });

    expect(ownAdf.statusCode).toBe(200);
    const only278 = ownAdf.json<StatusBody>();
    expect(only278.conflictCount).toBe(1);
    expect(only278.stats.PENDING_CREATE).toBe(1);
    expect(only278.stats.total_pending).toBe(2);
  });

  it("requereix sessió i el permís view_sync_status", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/api/osm/status" });
    expect(anonymous.statusCode).toBe(401);

    const coordinator = await app.inject({
      method: "GET",
      url: "/api/osm/status",
      headers: { cookie: coord278Cookie },
    });
    expect(coordinator.statusCode).toBe(403);
  });
});

describe("GET /api/osm/pending", () => {
  function seedPending(): void {
    createHydrant({
      id: "p-create",
      sync_status: "PENDING_CREATE",
      osm_tags: { "addr:street": "Carrer A", "addr:housenumber": "1" },
    });
    createHydrant({ id: "p-update", sync_status: "PENDING_UPDATE", osm_id: 1, osm_version: 1 });
    createHydrant({ id: "p-delete", sync_status: "PENDING_DELETE", osm_id: 2, osm_version: 1 });
    createHydrant({ id: "p-conflict", sync_status: "CONFLICT", osm_id: 3, osm_version: 1 });
    createHydrant({ id: "p-error", sync_status: "ERROR" });
    createHydrant({ id: "p-review", sync_status: "REVIEW" });
    createHydrant({ id: "p-synced", sync_status: "SYNCED" });
    createHydrant({ id: "p-missing", sync_status: "MISSING_IN_OSM" });
    createHydrant({ id: "p-279", adf_id: ADF_279, sync_status: "PENDING_CREATE" });
  }

  it("llista només els canvis no sincronitzats de l'ADF demanada", async () => {
    seedPending();

    const response = await app.inject({
      method: "GET",
      url: `/api/osm/pending?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      pending: Array<{ id: string; street?: string; num?: string }>;
      stats: Record<string, number>;
    }>();
    expect(body.pending).toHaveLength(7);
    expect(body.pending.map((row) => row.id)).not.toContain("p-279");
    expect(body.pending.map((row) => row.id)).not.toContain("p-synced");

    const created = body.pending.find((row) => row.id === "p-create");
    expect(created?.street).toBe("Carrer A");
    expect(created?.num).toBe("1");

    expect(body.stats).toMatchObject({
      PENDING_CREATE: 1,
      PENDING_UPDATE: 1,
      PENDING_DELETE: 1,
      CONFLICT: 1,
      ERROR: 1,
      REVIEW: 1,
      MISSING_IN_OSM: 1,
      total_pending: 4,
    });
  });

  it("retorna 400 si falta l'ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/osm/pending",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(400);
  });

  it("és només per a l'admin", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/osm/pending?adf=${ADF_278}`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /api/osm/discard-selected", () => {
  it("esborra els PENDING_CREATE i restaura els altres des de les dades remotes", async () => {
    createHydrant({ id: "d-new", sync_status: "PENDING_CREATE" });
    createHydrant({
      id: "d-update",
      sync_status: "PENDING_UPDATE",
      osm_id: 700,
      osm_version: 2,
      osm_tags: { "addr:street": "Carrer Local" },
      remote_osm_tags: { "addr:street": "Carrer OSM" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/discard-selected",
      headers: { cookie: adminCookie },
      payload: { ids: ["d-new", "d-update"] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ discarded: number; deleted: number }>()).toEqual({
      discarded: 1,
      deleted: 1,
    });

    const updated = await app.inject({
      method: "GET",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });
    const ids = updated.json<HidrantFeatures>().features.map((feature) => feature.id);
    expect(ids).not.toContain("d-new");

    const row = updated
      .json<HidrantFeatures>()
      .features.find((feature) => feature.id === "d-update");
    expect(row?.properties.sync_status).toBe("SYNCED");
    expect(row?.properties.osm_tags?.["addr:street"]).toBe("Carrer OSM");
  });

  it("retorna 400 sense IDs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/discard-selected",
      headers: { cookie: adminCookie },
      payload: { ids: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("requereix el permís sync_osm", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/discard-selected",
      headers: { cookie: coord278Cookie },
      payload: { ids: ["x"] },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /api/osm/missing/purge", () => {
  it("purga els MISSING_IN_OSM d'una ADF i respecta la resta", async () => {
    createHydrant({ id: "m1", sync_status: "MISSING_IN_OSM" });
    createHydrant({ id: "m2", adf_id: ADF_279, sync_status: "MISSING_IN_OSM" });
    createHydrant({ id: "m3", sync_status: "MISSING_IN_OSM" });
    createHydrant({ id: "keep", sync_status: "SYNCED" });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/missing/purge",
      headers: { cookie: adminCookie },
      payload: { adf_id: "278" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ deleted: number }>()).toEqual({ deleted: 2 });

    const remaining = await app.inject({
      method: "GET",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });
    const ids = remaining.json<HidrantFeatures>().features.map((feature) => feature.id);
    expect(ids).toEqual(["keep"]);

    // `GET /api/hidrants` amaga els MISSING_IN_OSM a propòsit: comprovem la fila.
    expect(HidrantsRepository.findByIds(["m2"])[0]!.sync_status).toBe("MISSING_IN_OSM");
  });

  it("accepta una llista d'IDs", async () => {
    createHydrant({ id: "m1", sync_status: "MISSING_IN_OSM" });
    createHydrant({ id: "m2", sync_status: "MISSING_IN_OSM" });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/missing/purge",
      headers: { cookie: adminCookie },
      payload: { ids: ["m1"] },
    });

    expect(response.json<{ deleted: number }>()).toEqual({ deleted: 1 });
  });

  it("retorna 400 si no s'indica ADF ni IDs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/missing/purge",
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("requereix el permís sync_osm", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/missing/purge",
      headers: { cookie: coord278Cookie },
      payload: { adf_id: 278 },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /api/osm/push-selected", () => {
  it("només puja els IDs seleccionats", async () => {
    createHydrant({
      id: "selected",
      sync_status: "PENDING_CREATE",
      lat: 41.61,
      lon: 1.61,
      osm_tags: FULL_OSM_TAGS,
    });
    createHydrant({ id: "not-selected", sync_status: "PENDING_CREATE" });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/push-selected",
      headers: { cookie: adminCookie },
      payload: { ids: ["selected"] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ synced: number }>().synced).toBe(1);
    expect(osmApi.createNode).toHaveBeenCalledTimes(1);
    expect(osmApi.createNode).toHaveBeenCalledWith(
      41.61,
      1.61,
      expect.objectContaining({ emergency: "fire_hydrant" }),
      4242,
    );

    const selected = await app.inject({
      method: "GET",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });
    const selectedFeature = selected
      .json<HidrantFeatures>()
      .features.find((feature) => feature.id === "selected");
    expect(selectedFeature?.properties.sync_status).toBe("SYNCED");

    const notSelected = selected
      .json<HidrantFeatures>()
      .features.find((feature) => feature.id === "not-selected");
    expect(notSelected?.properties.sync_status).toBe("PENDING_CREATE");
  });

  it("reintenta un ERROR amb osm_id com a actualització", async () => {
    createHydrant({
      id: "retry",
      sync_status: "ERROR",
      osm_id: 700,
      osm_version: 2,
      osm_tags: FULL_OSM_TAGS,
    });
    vi.mocked(osmApi.updateNode).mockResolvedValue({ ok: true, status: 200, data: "3" });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/push-selected",
      headers: { cookie: adminCookie },
      payload: { ids: ["retry"] },
    });

    expect(response.json<{ synced: number }>().synced).toBe(1);
    expect(osmApi.updateNode).toHaveBeenCalledTimes(1);
  });

  it("retorna 400 sense IDs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/push-selected",
      headers: { cookie: adminCookie },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it("requereix el permís sync_osm", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/osm/push-selected",
      headers: { cookie: coord278Cookie },
      payload: { ids: ["x"] },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("POST /api/osm/push-sync", () => {
  it("amb adf_id només puja els pendents d'aquella ADF", async () => {
    createHydrant({
      id: "push-278",
      sync_status: "PENDING_CREATE",
      lat: 41.61,
      lon: 1.61,
      osm_tags: FULL_OSM_TAGS,
    });
    createHydrant({
      id: "push-279",
      adf_id: ADF_279,
      sync_status: "PENDING_CREATE",
      lat: 41.62,
      lon: 1.62,
      osm_tags: FULL_OSM_TAGS,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/osm/push-sync",
      headers: { cookie: adminCookie },
      payload: { adf_id: ADF_278 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ synced: number }>().synced).toBe(1);
    expect(osmApi.createNode).toHaveBeenCalledTimes(1);

    const rows = HidrantsRepository.findByIds(["push-278", "push-279"]);
    expect(rows.find((row) => row.id === "push-278")?.sync_status).toBe("SYNCED");
    expect(rows.find((row) => row.id === "push-279")?.sync_status).toBe("PENDING_CREATE");
  });

  it("accepta adf_id com a text i rebutja un valor no numèric", async () => {
    // Client antic: `adf_id` arriba com a text; `z.coerce` el converteix.
    const asText = await app.inject({
      method: "POST",
      url: "/api/osm/push-sync",
      headers: { cookie: adminCookie },
      payload: { adf_id: "278" },
    });
    expect(asText.statusCode).toBe(200);

    // Sense `z.coerce`, `Number("abc")` era `NaN` i acabava en un push global.
    const invalid = await app.inject({
      method: "POST",
      url: "/api/osm/push-sync",
      headers: { cookie: adminCookie },
      payload: { adf_id: "abc" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(osmApi.createChangeset).not.toHaveBeenCalled();
  });
});
