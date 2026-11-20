import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { adfs, hidrants } from "../src/db/schema.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import {
  ADF_278,
  createSyncedHydrant,
  createHydrant,
  FULL_UI_FIELDS,
  resetDatabase,
  seedStandardWorld,
} from "./helpers/db.js";

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let coord279Cookie: string;
let voluntariCookie: string;

const NEW_HYDRANT = {
  lat: 41.61,
  lon: 1.61,
  ui_fields: { type: "pillar", position: "lane", street: "Carrer Nou" },
};

beforeAll(async () => {
  app = await createTestApp();
  resetDatabase();
  seedStandardWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
  coord279Cookie = await loginCookie(app, "279/001");
  voluntariCookie = await loginCookie(app, "278/002");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  seedStandardWorld();
});

describe("POST /api/hidrants", () => {
  it("retorna 401 sense sessió", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/hidrants?adf=${ADF_278}`,
      payload: NEW_HYDRANT,
    });

    expect(response.statusCode).toBe(401);
  });

  it("crea un hidrant PENDING_CREATE per a un voluntari de la seva ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: NEW_HYDRANT,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.sync_status).toBe("PENDING_CREATE");

    const row = db.select().from(hidrants).where(eq(hidrants.id, body.id)).get();
    expect(row?.adf_id).toBe(278);
    expect(row?.sync_status).toBe("PENDING_CREATE");
  });

  it("retorna 403 si un voluntari intenta crear a una altra ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/hidrants?adf=279`,
      headers: { cookie: voluntariCookie },
      payload: NEW_HYDRANT,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("aquesta ADF");
  });

  it("retorna 400 si no s'indica l'ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/hidrants",
      headers: { cookie: voluntariCookie },
      payload: NEW_HYDRANT,
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 400 si les coordenades no són números", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { lat: "north", lon: 1.6 },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna 403 si el punt cau fora del límit de l'ADF", async () => {
    db.update(adfs)
      .set({
        boundary_geojson: JSON.stringify({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
          },
        }),
      })
      .where(eq(adfs.id, ADF_278))
      .run();

    const response = await app.inject({
      method: "POST",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { lat: 50, lon: 50 },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toContain("fora del límit");
  });
});

describe("GET /api/hidrants", () => {
  it("és públic i amaga les observacions privades sense sessió", async () => {
    createHydrant({
      id: "h-private-tags",
      private_tags: JSON.stringify({ nota: "intern" }),
    });

    const anonymous = await app.inject({
      method: "GET",
      url: `/api/hidrants?adf=${ADF_278}`,
    });
    expect(anonymous.statusCode).toBe(200);
    const anonymousFeature = anonymous.json().features[0];
    expect(anonymousFeature.properties.private_tags).toBeUndefined();
    expect(anonymousFeature.properties.notes).toBeUndefined();

    const logged = await app.inject({
      method: "GET",
      url: `/api/hidrants?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
    });
    expect(logged.json().features[0].properties.private_tags).toEqual({ nota: "intern" });
  });

  it("no pinta els hidrants PENDING_DELETE ni MISSING_IN_OSM", async () => {
    createHydrant({ id: "h-visible", sync_status: "SYNCED" });
    createHydrant({ id: "h-deleting", sync_status: "PENDING_DELETE" });
    createHydrant({ id: "h-missing", sync_status: "MISSING_IN_OSM" });

    const response = await app.inject({ method: "GET", url: `/api/hidrants?adf=${ADF_278}` });

    const ids = response.json().features.map((feature: { id: string }) => feature.id);
    expect(ids).toEqual(["h-visible"]);
  });

  it("retorna 400 si no s'indica l'ADF", async () => {
    const response = await app.inject({ method: "GET", url: "/api/hidrants" });
    expect(response.statusCode).toBe(400);
  });
});

describe("PUT /api/hidrants/:id: màquina d'estats", () => {
  it("no canvia res si s'envien les mateixes dades", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { lat: 41.6, lon: 1.6, ui_fields: FULL_UI_FIELDS },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sync_status).toBe("SYNCED");
  });

  it("SYNCED + edició real → PENDING_UPDATE; tornar a l'original → SYNCED", async () => {
    createSyncedHydrant();

    const changed = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { ui_fields: { ...FULL_UI_FIELDS, street: "Carrer Nou" } },
    });

    expect(changed.statusCode).toBe(200);
    expect(changed.json().sync_status).toBe("PENDING_UPDATE");

    const reverted = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { ui_fields: FULL_UI_FIELDS },
    });

    expect(reverted.statusCode).toBe(200);
    expect(reverted.json().sync_status).toBe("SYNCED");
  });

  it("un canvi només d'observacions privades no genera PENDING_UPDATE", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { private_tags: { nota: "actualitzada" } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sync_status).toBe("SYNCED");

    const row = db.select().from(hidrants).where(eq(hidrants.id, "hydrant-synced")).get();
    expect(JSON.parse(row?.private_tags ?? "{}")).toEqual({ nota: "actualitzada" });
  });

  it("limita el desplaçament a 50 metres", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { lat: 42.6, lon: 1.6 },
    });

    expect(response.statusCode).toBe(200);
    const row = db.select().from(hidrants).where(eq(hidrants.id, "hydrant-synced")).get();
    expect(row!.lat).toBeGreaterThan(41.6);
    expect(row!.lat).toBeLessThan(41.601);
    expect(row!.lon).toBeCloseTo(1.6, 6);
  });

  it("no deixa que un usuari editi un hidrant d'una altra ADF", async () => {
    createHydrant({ id: "hydrant-279", adf_id: 279 });

    const response = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-279?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: { lat: 41.6, lon: 1.6 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("retorna 403 si algú sense permís d'edició hi intenta escriure", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "PUT",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: coord279Cookie },
      payload: { ui_fields: FULL_UI_FIELDS },
    });

    expect(response.statusCode).toBe(403);
  });
});

describe("DELETE /api/hidrants/:id", () => {
  it("un voluntari no pot esborrar hidrants", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("marca PENDING_DELETE si l'hidrant ja era a OSM", async () => {
    createSyncedHydrant();

    const response = await app.inject({
      method: "DELETE",
      url: `/api/hidrants/hydrant-synced?adf=${ADF_278}`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(200);
    const row = db.select().from(hidrants).where(eq(hidrants.id, "hydrant-synced")).get();
    expect(row?.sync_status).toBe("PENDING_DELETE");
  });

  it("esborra directament un PENDING_CREATE que mai s'ha publicat", async () => {
    createHydrant({ id: "hydrant-new", sync_status: "PENDING_CREATE" });

    const response = await app.inject({
      method: "DELETE",
      url: `/api/hidrants/hydrant-new?adf=${ADF_278}`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(db.select().from(hidrants).where(eq(hidrants.id, "hydrant-new")).get()).toBeUndefined();
  });

  it("un admin pot esborrar hidrants de qualsevol ADF", async () => {
    createHydrant({ id: "hydrant-279", adf_id: 279, sync_status: "PENDING_CREATE" });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/hidrants/hydrant-279?adf=279",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
  });
});
