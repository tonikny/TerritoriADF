import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { incidencies } from "../src/db/schema.js";
import type { IncidenciaEstat, IncidenciaVisibilitat } from "../src/types.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import type { ErrorBody, HidrantFeatures } from "./helpers/types.js";
import { ADF_278, ADF_279, resetWorld } from "./helpers/db.js";

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let coord279Cookie: string;
let voluntariCookie: string;

const INCIDENCIES = [
  { id: "inc-public-278", adf: ADF_278, visibilitat: "PUBLICA", estat: "OBERT" },
  { id: "inc-shared-278", adf: ADF_278, visibilitat: "TOTES_ADFS", estat: "OBERT" },
  { id: "inc-private-278", adf: ADF_278, visibilitat: "ADF_PRIVADA", estat: "OBERT" },
  { id: "inc-public-closed-278", adf: ADF_278, visibilitat: "PUBLICA", estat: "TANCAT" },
  { id: "inc-private-279", adf: ADF_279, visibilitat: "ADF_PRIVADA", estat: "OBERT" },
] as const;

function seedIncidencies(): void {
  for (const incidencia of INCIDENCIES) {
    db.insert(incidencies)
      .values({
        id: incidencia.id,
        titol: `Incidència ${incidencia.id}`,
        tipus: "ALTRE",
        adf_id: incidencia.adf,
        lat: 41.6,
        lon: 1.6,
        visibilitat: incidencia.visibilitat as IncidenciaVisibilitat,
        estat: incidencia.estat as IncidenciaEstat,
      })
      .run();
  }
}

function featureIds(responseBody: { features: Array<{ id: string }> }): string[] {
  return responseBody.features.map((feature) => feature.id).sort();
}

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
  coord279Cookie = await loginCookie(app, "279/001");
  voluntariCookie = await loginCookie(app, "278/002");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetWorld();
  seedIncidencies();
});

describe("visibilitat de la llista d'incidències", () => {
  it("sense sessió només veu les PUBLICA obertes", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/incidencies?adf=${ADF_278}`,
    });

    expect(response.statusCode).toBe(200);
    expect(featureIds(response.json<HidrantFeatures>())).toEqual(["inc-public-278"]);
  });

  it("sense sessió pot incloure les tancades si ho demana", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/incidencies?adf=${ADF_278}&incloure_tancades=true`,
    });

    expect(featureIds(response.json<HidrantFeatures>())).toEqual([
      "inc-public-278",
      "inc-public-closed-278",
    ]);
  });

  it("un voluntari veu les públiques, les compartides i les privades de la seva ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/incidencies?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
    });

    expect(featureIds(response.json<HidrantFeatures>())).toEqual([
      "inc-private-278",
      "inc-public-278",
      "inc-shared-278",
    ]);
  });

  it("un coordinador d'una altra ADF no veu les privades alienes", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/incidencies?adf=${ADF_278}`,
      headers: { cookie: coord279Cookie },
    });

    expect(featureIds(response.json<HidrantFeatures>())).toEqual([
      "inc-public-278",
      "inc-shared-278",
    ]);
  });

  it("l'admin ho veu tot", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/incidencies?adf=${ADF_278}`,
      headers: { cookie: adminCookie },
    });

    expect(featureIds(response.json<HidrantFeatures>())).toEqual([
      "inc-private-278",
      "inc-public-278",
      "inc-shared-278",
    ]);
  });
});

describe("GET /api/incidencies/:id", () => {
  it("retorna 404 per a una privada aliena (no en revela l'existència)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/incidencies/inc-private-278",
    });

    expect(response.statusCode).toBe(404);
  });

  it("retorna el detall i l'historial a un membre de l'ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/incidencies/inc-private-278",
      headers: { cookie: voluntariCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ id: string; events: unknown[] }>();
    expect(body.id).toBe("inc-private-278");
    expect(Array.isArray(body.events)).toBe(true);
  });
});

describe("POST /api/incidencies", () => {
  it("retorna 401 sense sessió", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/incidencies?adf=${ADF_278}`,
      payload: { titol: "Foc", tipus: "FOC", lat: 41.6, lon: 1.6 },
    });

    expect(response.statusCode).toBe(401);
  });

  it("un voluntari crea sempre una incidència ADF_PRIVADA", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/incidencies?adf=${ADF_278}`,
      headers: { cookie: voluntariCookie },
      payload: {
        titol: "Foc al bosc",
        tipus: "FOC",
        visibilitat: "PUBLICA",
        lat: 41.6,
        lon: 1.6,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ visibilitat: string }>().visibilitat).toBe("ADF_PRIVADA");
  });

  it("un coordinador pot triar la visibilitat inicial", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/api/incidencies?adf=${ADF_278}`,
      headers: { cookie: coord278Cookie },
      payload: {
        titol: "Foc visible",
        tipus: "FOC",
        visibilitat: "PUBLICA",
        lat: 41.6,
        lon: 1.6,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ visibilitat: string }>().visibilitat).toBe("PUBLICA");
  });
});

describe("POST /api/incidencies/:id/events", () => {
  it("afegeix una observació a una incidència de la seva ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-private-278/events",
      headers: { cookie: voluntariCookie },
      payload: {
        tipus_event: "OBSERVACIO",
        dades: { observador: "278/002", comentari: "Hi ha una mànega" },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      tipus_event: string;
      dades: { observador?: string; comentari?: string };
    }>();
    expect(body.tipus_event).toBe("OBSERVACIO");
    expect(body.dades).toEqual({ observador: "278/002", comentari: "Hi ha una mànega" });
  });

  it("retorna 404 si no pot veure la incidència", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-private-278/events",
      headers: { cookie: coord279Cookie },
      payload: { tipus_event: "OBSERVACIO", dades: { comentari: "Hola" } },
    });

    expect(response.statusCode).toBe(404);
  });

  it("retorna 403 si la incidència és d'una altra ADF però és visible", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-public-278/events",
      headers: { cookie: coord279Cookie },
      payload: { tipus_event: "OBSERVACIO", dades: { comentari: "Hola" } },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error).toContain("membres de l'ADF");
  });

  it("un voluntari no pot canviar la visibilitat", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-private-278/events",
      headers: { cookie: voluntariCookie },
      payload: { tipus_event: "CANVI_VISIBILITAT", dades: { nou: "PUBLICA" } },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error).toContain("coordinador");
  });

  it("el coordinador de l'ADF sí que pot canviar la visibilitat", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-private-278/events",
      headers: { cookie: coord278Cookie },
      payload: { tipus_event: "CANVI_VISIBILITAT", dades: { nou: "TOTES_ADFS" } },
    });

    expect(response.statusCode).toBe(201);

    const row = db.select().from(incidencies).where(eq(incidencies.id, "inc-private-278")).get();
    expect(row?.visibilitat).toBe("TOTES_ADFS");
  });

  it("retorna 401 sense sessió", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/incidencies/inc-public-278/events",
      payload: { tipus_event: "OBSERVACIO", dades: { comentari: "Hola" } },
    });

    expect(response.statusCode).toBe(401);
  });
});
