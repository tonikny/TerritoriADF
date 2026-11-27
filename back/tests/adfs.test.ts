import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestApp, loginCookie } from "./helpers/app.js";
import type { ErrorBody } from "./helpers/types.js";
import { ADF_278, resetWorld } from "./helpers/db.js";

/** Camps d'una ADF que mira aquesta suite a `GET /api/adfs` i al detall. */
type AdfSummary = { id: number; osm_relations: string[] };

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
});

describe("CRUD d'ADFs", () => {
  it("la llista és pública i retorna els camps JSON parsejats", async () => {
    const response = await app.inject({ method: "GET", url: "/api/adfs" });

    expect(response.statusCode).toBe(200);
    const rows = response.json<AdfSummary[]>();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.osm_relations).toEqual([`R${rows[0]!.id}`]);
    expect(Array.isArray(rows[0]!.osm_relations)).toBe(true);
  });

  it("el detall retorna 404 si l'ADF no existeix", async () => {
    const response = await app.inject({ method: "GET", url: "/api/adfs/999" });

    expect(response.statusCode).toBe(404);
  });

  it("un coordinador no pot crear ADFs", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/adfs",
      headers: { cookie: coord278Cookie },
      payload: { id: 300, nom: "ADF Nova", osm_relations: ["R999"] },
    });

    expect(response.statusCode).toBe(403);
  });

  it("l'admin crea una ADF i no en pot duplicar l'ID", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/adfs",
      headers: { cookie: adminCookie },
      payload: { id: 300, nom: "ADF Nova", osm_relations: ["R999"] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<AdfSummary>().osm_relations).toEqual(["R999"]);

    const duplicate = await app.inject({
      method: "POST",
      url: "/api/adfs",
      headers: { cookie: adminCookie },
      payload: { id: 300, nom: "Una altra", osm_relations: ["R1000"] },
    });
    expect(duplicate.statusCode).toBe(400);
  });

  it("rebutja una ADF sense relacions OSM vàlides", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/adfs",
      headers: { cookie: adminCookie },
      payload: { id: 301, nom: "Sense relacions", osm_relations: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("no es pot esborrar una ADF amb usuaris associats", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/adfs/${ADF_278}`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json<ErrorBody>().code).toBe("CONFLICT");
  });

  it("esborra una ADF sense dades associades", async () => {
    await app.inject({
      method: "POST",
      url: "/api/adfs",
      headers: { cookie: adminCookie },
      payload: { id: 300, nom: "ADF Buidable", osm_relations: ["R999"] },
    });

    const response = await app.inject({
      method: "DELETE",
      url: "/api/adfs/300",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe("endpoints de plataforma", () => {
  it("GET /api/config publica la matriu de permisos i els límits compartits", async () => {
    const response = await app.inject({ method: "GET", url: "/api/config" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      max_hydrant_move_meters: number;
      min_password_length: number;
      role_permissions: Record<string, string[]>;
    }>();
    expect(body.max_hydrant_move_meters).toBe(50);
    expect(body.min_password_length).toBe(8);
    expect(body.role_permissions.admin).toContain("manage_adfs");
    expect(body.role_permissions.voluntari).not.toContain("manage_users");
  });

  it("GET /healthz respon sense tocar la BD", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ status: string }>().status).toBe("ok");
  });

  it("GET /readyz confirma BD oberta i migracions aplicades", async () => {
    const response = await app.inject({ method: "GET", url: "/readyz" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      status: string;
      checks: { database: { status: string }; migrations: { status: string } };
    }>();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.migrations.status).toBe("ok");
  });

  it("GET /api/openapi.json inclou les rutes principals", async () => {
    const response = await app.inject({ method: "GET", url: "/api/openapi.json" });

    expect(response.statusCode).toBe(200);
    const paths = response.json<{ paths: Record<string, unknown> }>().paths;
    expect(paths["/api/hidrants"]).toBeDefined();
    expect(paths["/api/users"]).toBeDefined();
  });

  it("retorna 405 si el path existeix amb un altre mètode", async () => {
    const response = await app.inject({ method: "POST", url: "/healthz" });

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toContain("GET");
  });

  it("retorna 404 per a un path desconegut", async () => {
    const response = await app.inject({ method: "GET", url: "/api/no-existeix" });

    expect(response.statusCode).toBe(404);
  });
});
