import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import type { ErrorBody } from "./helpers/types.js";
import { ADMIN_ID, COORD_278_ID, resetWorld, VOL_278_ID } from "./helpers/db.js";

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let coord279Cookie: string;
let voluntariCookie: string;

beforeAll(async () => {
  app = await createTestApp();
  // Un sol login per rol: els IDs dels usuaris són estables i cada reset torna a
  // crear-los amb token_version 0, així que les cookies segueixen sent vàlides.
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
});

describe("GET /api/users: abast per rol", () => {
  it("retorna 401 sense sessió", async () => {
    const response = await app.inject({ method: "GET", url: "/api/users" });
    expect(response.statusCode).toBe(401);
  });

  it("retorna 403 per a un voluntari", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: voluntariCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("un coordinador només veu els usuaris de la seva ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(200);
    const usernames = response.json<Array<{ username: string }>>().map((row) => row.username);
    expect(usernames).toEqual(["278/001", "278/002"]);
  });

  it("un altre coordinador tampoc no veu la primera ADF", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: coord279Cookie },
    });

    expect(response.statusCode).toBe(200);
    const usernames = response.json<Array<{ username: string }>>().map((row) => row.username);
    expect(usernames).toEqual(["279/001"]);
  });

  it("l'admin els veu tots", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const usernames = response.json<Array<{ username: string }>>().map((row) => row.username);
    expect(usernames).toEqual(["278/001", "278/002", "279/001", "admin"]);
  });
});

describe("POST /api/users: alta i abast", () => {
  it("un coordinador crea un voluntari de la seva ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: coord278Cookie },
      payload: { username: "278/010", role: "voluntari" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      username: string;
      adf_id: number;
      role: string;
      access_url: string;
    }>();
    expect(body.username).toBe("278/010");
    expect(body.adf_id).toBe(278);
    expect(body.role).toBe("voluntari");
    expect(body.access_url).toContain("/acces/");
  });

  it("un coordinador no pot crear usuaris d'una altra ADF", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: coord278Cookie },
      payload: { username: "279/010", role: "voluntari" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error).toContain("gestionar aquest usuari");
  });

  it("un coordinador no pot crear administradors", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: coord278Cookie },
      payload: { username: "278/011", role: "admin" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("l'admin sí que pot crear administradors", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: { username: "278/011", role: "admin" },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json<{ role: string }>().role).toBe("admin");
  });

  it("rebutja un username duplicat amb 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: coord278Cookie },
      payload: { username: "278/002", role: "voluntari" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error).toContain("ja existeix");
  });

  it("rebutja una ADF inexistent amb 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: { username: "999/001", role: "voluntari" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error).toContain("no existeix");
  });

  it("rebutja un format d'username invàlid amb 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: { username: "278-010", role: "voluntari" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("PUT /api/users/:id: abast i rols", () => {
  it("un coordinador pot canviar el rol d'un usuari de la seva ADF", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/users/${VOL_278_ID}`,
      headers: { cookie: coord278Cookie },
      payload: { role: "coordinador" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ role: string }>().role).toBe("coordinador");
  });

  it("un coordinador no es pot modificar a si mateix", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/users/${COORD_278_ID}`,
      headers: { cookie: coord278Cookie },
      payload: { role: "voluntari" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error).toContain("tu mateix");
  });

  it("un coordinador no pot modificar un administrador", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/users/${ADMIN_ID}`,
      headers: { cookie: coord278Cookie },
      payload: { role: "voluntari" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<ErrorBody>().error).toContain("administradors");
  });

  it("un coordinador no pot modificar usuaris d'una altra ADF", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/users/${VOL_278_ID}`,
      headers: { cookie: coord279Cookie },
      payload: { role: "voluntari" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("l'admin pot canviar el rol de qualsevol usuari", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/users/${COORD_278_ID}`,
      headers: { cookie: adminCookie },
      payload: { role: "admin" },
    });

    expect(response.statusCode).toBe(200);
    const row = db.select().from(users).where(eq(users.id, COORD_278_ID)).get();
    expect(row?.role).toBe("admin");
  });
});

describe("DELETE /api/users/:id", () => {
  it("un coordinador esborra un voluntari de la seva ADF", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/users/${VOL_278_ID}`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(db.select().from(users).where(eq(users.id, VOL_278_ID)).get()).toBeUndefined();
  });

  it("un coordinador no pot esborrar-se a si mateix", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/users/${COORD_278_ID}`,
      headers: { cookie: coord278Cookie },
    });

    expect(response.statusCode).toBe(403);
    expect(db.select().from(users).where(eq(users.id, COORD_278_ID)).get()).toBeDefined();
  });
});
