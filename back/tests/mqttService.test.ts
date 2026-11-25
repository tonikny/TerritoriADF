// El servei MQTT és el que converteix missatges OwnTracks en posicions visibles.
// Aquí es prova la frontera: connexions (mockejades), identitat plana, parseig i
// descart de payloads, cicle de vida i gestió d'usuaris DynSec.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mqttNameFor, mqttService } from "../src/services/mqtt.js";
import { config } from "../src/utils/config.js";
import { asMqttClient, createFakeMqttClient, type FakeMqttClient } from "./helpers/mqtt.js";

const mqttMock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("mqtt", () => ({ default: mqttMock }));

const dynsec = vi.hoisted(() => ({
  dynsecConnect: vi.fn(),
  dynsecCommand: vi.fn(),
  ensureRole: vi.fn(),
  ensureClient: vi.fn(),
}));
vi.mock("../src/services/dynsec.js", () => dynsec);

/** Arrenca el servei amb el broker connectat de seguida. */
async function startService(): Promise<FakeMqttClient> {
  const client = createFakeMqttClient();
  mqttMock.connect.mockReturnValue(client);

  const started = mqttService.start();
  await vi.waitFor(() => expect(mqttMock.connect).toHaveBeenCalled());
  client.emit("connect");
  await started;
  return client;
}

function publishLocation(
  client: FakeMqttClient,
  identity: string,
  payload: Record<string, unknown>,
): void {
  client.emit(
    "message",
    `${config.MQTT_TOPIC_PREFIX}/${identity}`,
    Buffer.from(JSON.stringify(payload)),
  );
}

const NOW_SECONDS = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  mqttMock.connect.mockReset();
  dynsec.dynsecConnect.mockReset();
  dynsec.dynsecCommand.mockReset();
  dynsec.ensureRole.mockReset();
  dynsec.ensureClient.mockReset();

  // Sense accés anònim (el cas de producció); l'admin sí que connecta.
  dynsec.dynsecConnect.mockImplementation(async (username?: string) => {
    if (!username) {
      throw new Error("Anonymous access disabled");
    }
    return asMqttClient(createFakeMqttClient());
  });
  dynsec.dynsecCommand.mockResolvedValue({});
  dynsec.ensureRole.mockResolvedValue(undefined);
  dynsec.ensureClient.mockResolvedValue(undefined);
});

afterEach(() => {
  mqttService.stop();
  vi.clearAllMocks();
});

describe("mqttNameFor", () => {
  it("aplanla les barres de la identitat MQTT", () => {
    expect(mqttNameFor("278/001")).toBe("278_001");
    expect(mqttNameFor("278/GI/001")).toBe("278_GI_001");
  });
});

describe("MqttService", () => {
  it("connecta com a backend, aplica DynSec i subscriu al prefix", async () => {
    const client = await startService();

    expect(mqttService.isAvailable()).toBe(true);
    expect(client.subscribe).toHaveBeenCalledWith(
      `${config.MQTT_TOPIC_PREFIX}/#`,
      { qos: 1 },
      expect.any(Function),
    );
    // Bootstrap: roles de dispositiu i de backend, i client del backend.
    expect(dynsec.ensureRole).toHaveBeenCalledTimes(2);
    expect(dynsec.ensureClient).toHaveBeenCalledWith(
      expect.anything(),
      config.MQTT_BACKEND_USERNAME,
      config.MQTT_BACKEND_PASSWORD,
      "backend-service",
    );
  });

  it("desa les posicions vives i incrementa la revisió", async () => {
    const client = await startService();
    const before = mqttService.getPositionsRevision();

    publishLocation(client, "278_GI_001", {
      _type: "location",
      lat: 41.6,
      lon: 1.6,
      acc: 12,
      batt: 85,
      ts: NOW_SECONDS(),
    });

    expect(mqttService.getPositions().get("278_GI_001")).toMatchObject({
      lat: 41.6,
      lon: 1.6,
      accuracy: 12,
      battery: 85,
    });
    expect(mqttService.getPositionsRevision()).toBeGreaterThan(before);
  });

  it("accepta sub-topics de dispositiu i usa `tst` si no hi ha `ts`", async () => {
    const client = await startService();

    client.emit(
      "message",
      `${config.MQTT_TOPIC_PREFIX}/278_001/device`,
      Buffer.from(
        JSON.stringify({ _type: "location", lat: 41.5, lon: 2, batt: 50, tst: NOW_SECONDS() }),
      ),
    );

    expect(mqttService.getPositions().get("278_001")).toMatchObject({ lat: 41.5, lon: 2 });
  });

  it("descarta payloads que no són posicions vives", async () => {
    const client = await startService();

    // No és un location
    publishLocation(client, "278_001", { _type: "status", lat: 41.5, lon: 2 });
    // Massa antiga (més de 15 minuts)
    publishLocation(client, "278_001", {
      _type: "location",
      lat: 1,
      lon: 1,
      ts: NOW_SECONDS() - 3600,
    });
    // JSON trencat
    client.emit("message", `${config.MQTT_TOPIC_PREFIX}/278_001`, Buffer.from("{{{"));
    // Topic sense identitat després del prefix
    client.emit(
      "message",
      config.MQTT_TOPIC_PREFIX,
      Buffer.from(JSON.stringify({ _type: "location", lat: 1, lon: 1 })),
    );

    expect(mqttService.getPositions().size).toBe(0);
  });

  it("en aturar-se buida les posicions i deixa d'estar disponible", async () => {
    const client = await startService();
    publishLocation(client, "278_001", { _type: "location", lat: 41.5, lon: 2 });
    const revision = mqttService.getPositionsRevision();

    mqttService.stop();

    expect(mqttService.isAvailable()).toBe(false);
    expect(mqttService.getPositions().size).toBe(0);
    expect(mqttService.getPositionsRevision()).toBeGreaterThan(revision);
  });

  it("marca el broker no disponible si la connexió cau", async () => {
    const client = await startService();
    expect(mqttService.isAvailable()).toBe(true);

    client.emit("close");
    expect(mqttService.isAvailable()).toBe(false);

    client.emit("offline");
    expect(mqttService.isAvailable()).toBe(false);
  });

  it("crea l'usuari MQTT i, si ja existeix, n'actualitza la contrasenya", async () => {
    const client = await startService();
    const mqttClient = asMqttClient(client);

    await mqttService.createMqttUser("278_001", "pw");

    expect(dynsec.dynsecCommand).toHaveBeenCalledWith(mqttClient, {
      command: "createClient",
      username: "278_001",
      password: "pw",
      roles: [{ rolename: "owntracks-device" }],
    });

    dynsec.dynsecCommand
      .mockRejectedValueOnce(new Error("Client exists"))
      .mockResolvedValueOnce({});
    await mqttService.createMqttUser("278_001", "nova");

    expect(dynsec.dynsecCommand).toHaveBeenLastCalledWith(mqttClient, {
      command: "setClientPassword",
      username: "278_001",
      password: "nova",
    });
  });

  it("esborra l'usuari MQTT i exigeix connexió", async () => {
    mqttService.stop();
    await expect(mqttService.createMqttUser("278_001", "pw")).rejects.toThrow("MQTT no connectat");
    await expect(mqttService.deleteMqttUser("278_001")).rejects.toThrow("MQTT no connectat");

    const client = await startService();
    await mqttService.deleteMqttUser("278_001");

    expect(dynsec.dynsecCommand).toHaveBeenCalledWith(asMqttClient(client), {
      command: "deleteClient",
      username: "278_001",
    });
  });
});
