import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { createTestApp, login, loginCookie, sessionCookie } from "./helpers/app.js";
import { COORD_278_ID, resetDatabase, seedStandardWorld } from "./helpers/db.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetDatabase();
  seedStandardWorld();
});

describe("POST /api/auth/login", () => {
  it("retorna 400 si falten credencials", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "278/001" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Falten credencials" });
  });

  it("retorna 401 amb una contrasenya incorrecta", async () => {
    const response = await login(app, "278/001", "Incorrecta123");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Usuari o contrasenya incorrectes" });
  });

  it("retorna el mateix 401 per a un usuari inexistent (sense enumeració)", async () => {
    const response = await login(app, "278/999", "Incorrecta123");

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Usuari o contrasenya incorrectes" });
  });

  it("deixa la sessió en una cookie httpOnly i no retorna cap token al cos", async () => {
    const response = await login(app, "278/001");

    expect(response.statusCode).toBe(200);
    const cookie = response.cookies.find((c) => c.name === "auth_token");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("Lax");

    const body = response.json();
    expect(body.user.username).toBe("278/001");
    expect(body.user.permissions).toContain("manage_users");
    expect(body).not.toHaveProperty("token");
  });
});

describe("GET /api/auth/me", () => {
  it("retorna 401 sense sessió", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
  });

  it("retorna l'usuari i les capacitats del seu rol", async () => {
    const cookie = await loginCookie(app, "278/001");
    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.id).toBe(COORD_278_ID);
    expect(body.user.adf_id).toBe(278);
    expect(body.user.role).toBe("coordinador");
    expect(body.user.permissions).toContain("edit_hydrant");
    expect(body.user.permissions).not.toContain("manage_adfs");
  });

  it("un canvi de token_version invalida les cookies existents", async () => {
    const cookie = await loginCookie(app, "278/001");

    db.update(users).set({ token_version: 1 }).where(eq(users.id, COORD_278_ID)).run();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });

  it("un usuari esborrat invalida la seva sessió", async () => {
    const cookie = await loginCookie(app, "278/001");

    db.delete(users).where(eq(users.id, COORD_278_ID)).run();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("esborra la cookie de sessió", async () => {
    const cookie = await loginCookie(app, "278/001");
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(String(response.headers["set-cookie"])).toContain("auth_token=;");
  });
});

describe("fre de força bruta al login", () => {
  it("bloqueja l'usuari després de 5 intents fallits", async () => {
    // Username propi: els comptadors són estat de mòdul i altres tests ja han
    // provat logins fallits amb altres noms.
    for (let attempt = 0; attempt < 5; attempt++) {
      const failed = await login(app, "278/998", "Incorrecta123");
      expect(failed.statusCode).toBe(401);
    }

    const blocked = await login(app, "278/998", "Incorrecta123");
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.json().error).toContain("Massa intents fallits");
  });

  it("un login correcte neteja els comptadors de l'usuari", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const failed = await login(app, "278/001", "Incorrecta123");
      expect(failed.statusCode).toBe(401);
    }

    const success = await login(app, "278/001");
    expect(success.statusCode).toBe(200);

    const afterReset = await login(app, "278/001", "Incorrecta123");
    expect(afterReset.statusCode).toBe(401);
  });
});

describe("enllaços d'accés", () => {
  it("permet triar la contrasenya una sola vegada", async () => {
    const adminCookie = await loginCookie(app, "admin");
    const created = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: { username: "278/010", role: "voluntari" },
    });

    expect(created.statusCode).toBe(201);
    const accessUrl = created.json().access_url as string;
    const token = accessUrl.split("/").pop();
    expect(token).toBeTruthy();

    const info = await app.inject({ method: "GET", url: `/api/auth/access/${token}` });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toEqual({ username: "278/010" });

    const weak = await app.inject({
      method: "POST",
      url: `/api/auth/access/${token}`,
      payload: { password: "curta" },
    });
    expect(weak.statusCode).toBe(400);

    const redeemed = await app.inject({
      method: "POST",
      url: `/api/auth/access/${token}`,
      payload: { password: "novaContrasenya9" },
    });
    expect(redeemed.statusCode).toBe(200);
    expect(sessionCookie(redeemed)).toContain("auth_token=");

    const reused = await app.inject({
      method: "GET",
      url: `/api/auth/access/${token}`,
    });
    expect(reused.statusCode).toBe(410);

    const loginWithNewPassword = await login(app, "278/010", "novaContrasenya9");
    expect(loginWithNewPassword.statusCode).toBe(200);
  });
});
