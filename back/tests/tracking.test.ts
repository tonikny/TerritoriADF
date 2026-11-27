// Tracking OwnTracks: visibilitat de posicions per rol i ADF compartida,
// activació (credencials xifrades + .otrc), auto-curat de la identitat plana i
// descàrrega de la configuració. El servei MQTT es mockeja: aquí no hi ha broker.
import type { Position } from "@territoriadf/contracts/tracking";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AdfsRepository } from "../src/db/repositories/adfsRepository.js";
import { MqttUsersRepository } from "../src/db/repositories/mqttUsersRepository.js";
import { decrypt, encrypt } from "../src/utils/crypto.js";
import { config } from "../src/utils/config.js";
import { createTestApp, loginCookie } from "./helpers/app.js";
import { ADF_279, createUser, resetWorld, VOL_278_ID } from "./helpers/db.js";

const mqtt = vi.hoisted(() => ({
  positions: new Map<string, unknown>(),
  revision: 0,
  available: true,
  createMqttUser: vi.fn(),
  deleteMqttUser: vi.fn(),
}));

vi.mock("../src/services/mqtt.js", () => ({
  mqttNameFor: (username: string) => username.replaceAll("/", "_"),
  getPositions: () => mqtt.positions,
  getPositionsRevision: () => mqtt.revision,
  isAvailable: () => mqtt.available,
  createMqttUser: mqtt.createMqttUser,
  deleteMqttUser: mqtt.deleteMqttUser,
}));

let app: FastifyInstance;
let adminCookie: string;
let coord278Cookie: string;
let volontariCookie: string;

function position(overrides: Partial<Position> = {}): Position {
  return {
    lat: 41.6,
    lon: 1.6,
    accuracy: 10,
    timestamp: 1_700_000_000,
    battery: 80,
    receivedAt: Date.now(),
    ...overrides,
  };
}

function seedPositions(): void {
  mqtt.positions.clear();
  // El servei MQTT desa les posicions amb la identitat aplanada (`278_001`).
  for (const identity of ["admin", "278_001", "278_002", "279_001"]) {
    mqtt.positions.set(identity, position());
  }
}

function insertMqttRow(overrides: Record<string, unknown> = {}) {
  MqttUsersRepository.insert({
    id: "mqtt-1",
    user_id: VOL_278_ID,
    mqtt_username: "278/002",
    mqtt_password_enc: encrypt("contrasenya-vella"),
    enabled: true,
    ...overrides,
  });
}

async function enable() {
  return app.inject({
    method: "POST",
    url: "/api/tracking/enable",
    headers: { cookie: volontariCookie },
  });
}

beforeAll(async () => {
  app = await createTestApp();
  resetWorld();
  adminCookie = await loginCookie(app, "admin");
  coord278Cookie = await loginCookie(app, "278/001");
  volontariCookie = await loginCookie(app, "278/002");
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  resetWorld();
  vi.clearAllMocks();
  mqtt.positions.clear();
  mqtt.revision = 0;
  mqtt.available = true;
  mqtt.createMqttUser.mockResolvedValue(undefined);
  mqtt.deleteMqttUser.mockResolvedValue(undefined);
});

describe("GET /api/tracking/status", () => {
  it("requereix sessió", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tracking/status" });
    expect(response.statusCode).toBe(401);
  });

  it("diu si el broker hi és i si l'usuari té OwnTracks activat", async () => {
    const abans = await app.inject({
      method: "GET",
      url: "/api/tracking/status",
      headers: { cookie: volontariCookie },
    });
    expect(abans.json()).toEqual({ available: true, enabled: false });

    await enable();

    const despres = await app.inject({
      method: "GET",
      url: "/api/tracking/status",
      headers: { cookie: volontariCookie },
    });
    expect(despres.json()).toEqual({ available: true, enabled: true });
  });

  it("reflecteix un broker no disponible", async () => {
    mqtt.available = false;

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/status",
      headers: { cookie: adminCookie },
    });

    expect(response.json<{ available: boolean }>().available).toBe(false);
  });
});

describe("GET /api/tracking/positions", () => {
  it("l'admin veu totes les posicions", async () => {
    seedPositions();

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie: adminCookie },
    });

    expect(Object.keys(response.json<{ positions: object }>().positions).sort()).toEqual([
      "278/001",
      "278/002",
      "279/001",
      "admin",
    ]);
  });

  it("un coordinador només veu la seva ADF si no n'hi ha cap de compartida", async () => {
    seedPositions();

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie: coord278Cookie },
    });

    expect(Object.keys(response.json<{ positions: object }>().positions).sort()).toEqual([
      "278/001",
      "278/002",
    ]);
  });

  it("el coordinador veu les ADFs que comparteixen tracking (opt-in)", async () => {
    seedPositions();
    AdfsRepository.setTrackingShared(ADF_279, true);

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie: coord278Cookie },
    });

    expect(Object.keys(response.json<{ positions: object }>().positions)).toContain("279/001");
  });

  it("el voluntari no rep les posicions compartides", async () => {
    seedPositions();
    AdfsRepository.setTrackingShared(ADF_279, true);

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie: volontariCookie },
    });

    const keys = Object.keys(response.json<{ positions: object }>().positions);
    expect(keys).not.toContain("279/001");
    expect(keys).not.toContain("admin");
  });

  it("un usuari sense ADF no veu cap posició", async () => {
    seedPositions();
    createUser({ id: "user-sense-adf", username: "278/009", role: "voluntari", adfId: null });
    const cookie = await loginCookie(app, "278/009");

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie },
    });

    expect(response.json()).toEqual({ positions: {} });
  });

  it("retorna un objecte buit si no hi ha cap posició", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/positions",
      headers: { cookie: adminCookie },
    });

    expect(response.json()).toEqual({ positions: {} });
  });
});

describe("POST /api/tracking/enable", () => {
  it("crea l'usuari MQTT, desa la contrasenya xifrada i retorna el .otrc", async () => {
    const response = await enable();

    expect(response.statusCode).toBe(200);
    const otrc = response.json<Record<string, unknown>>();
    expect(otrc).toMatchObject({
      _type: "configuration",
      auth: true,
      username: "278_002",
      clientId: "278_002",
      host: config.BASE_DOMAIN_URL,
      port: config.OTRC_PORT,
      pubTopicBase: `${config.MQTT_TOPIC_PREFIX}/278_002`,
      mqttProtocolLevel: 4,
    });

    const password = String(otrc.password);
    expect(mqtt.createMqttUser).toHaveBeenCalledWith("278_002", password);

    const row = MqttUsersRepository.findByUserId(VOL_278_ID)!;
    expect(row.mqtt_username).toBe("278_002");
    expect(row.enabled).toBe(true);
    // A la BD només hi ha el xifrat, i es pot desxifrar.
    expect(row.mqtt_password_enc).not.toContain(password);
    expect(decrypt(row.mqtt_password_enc!)).toBe(password);
  });

  it("no queda enganxat a la identitat antiga amb barres", async () => {
    insertMqttRow();

    const response = await enable();

    expect(response.statusCode).toBe(200);
    expect(mqtt.deleteMqttUser).toHaveBeenCalledWith("278/002");
    expect(MqttUsersRepository.findByUserId(VOL_278_ID)!.mqtt_username).toBe("278_002");
  });

  it("retorna 503 si el broker no és disponible", async () => {
    mqtt.createMqttUser.mockRejectedValue(new Error("MQTT no connectat"));

    const response = await enable();

    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe("SERVICE_UNAVAILABLE");
    expect(MqttUsersRepository.findByUserId(VOL_278_ID)).toBeUndefined();
  });
});

describe("GET /api/tracking/config", () => {
  it("retorna 400 si OwnTracks no està activat", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/config",
      headers: { cookie: volontariCookie },
    });

    expect(response.statusCode).toBe(400);
  });

  it("retorna el .otrc amb la contrasenya desxifrada", async () => {
    insertMqttRow({ mqtt_username: "278_002" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/config",
      headers: { cookie: volontariCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json<{ password: string }>().password).toBe("contrasenya-vella");
    // La identitat ja coincideix: no s'ha de tocar el client del broker
    // (`setClientPassword` expulsaria el dispositiu).
    expect(mqtt.createMqttUser).not.toHaveBeenCalled();
  });

  it("auto-cura la identitat MQTT si va quedar amb barres", async () => {
    insertMqttRow();

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/config",
      headers: { cookie: volontariCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(mqtt.createMqttUser).toHaveBeenCalledWith("278_002", "contrasenya-vella");
    expect(mqtt.deleteMqttUser).toHaveBeenCalledWith("278/002");
    expect(MqttUsersRepository.findByUserId(VOL_278_ID)!.mqtt_username).toBe("278_002");
  });

  it("retorna 500 si la contrasenya no es pot desxifrar", async () => {
    insertMqttRow({ mqtt_password_enc: "això-no-és-xifrat" });

    const response = await app.inject({
      method: "GET",
      url: "/api/tracking/config",
      headers: { cookie: volontariCookie },
    });

    expect(response.statusCode).toBe(500);
  });
});
