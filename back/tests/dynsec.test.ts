// DynSec és MQTT amb comandaments JSON i respostes correlacionades pel nom del
// comandament: el que es prova aquí és aquesta coreografia (publicar, esperar la
// resposta que toca, ignorar la resta, timeout) i la idempotència dels rols.
import { afterEach, describe, expect, it, vi } from "vitest";

import { dynsecCommand, dynsecConnect, ensureClient, ensureRole } from "../src/services/dynsec.js";
import { config } from "../src/utils/config.js";
import { asMqttClient, createFakeMqttClient, type FakeMqttClient } from "./helpers/mqtt.js";

const mqttMock = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("mqtt", () => ({ default: mqttMock }));

const REQ_TOPIC = "$CONTROL/dynamic-security/v1";
const RESP_TOPIC = "$CONTROL/dynamic-security/v1/response";

/** Comandaments enviats, en ordre, extrets del `publish`. */
function sentCommands(client: FakeMqttClient): Record<string, unknown>[] {
  return client.publish.mock.calls.map((call: unknown[]) => {
    const body = JSON.parse(String(call[1])) as { commands: Record<string, unknown>[] };
    return body.commands[0]!;
  });
}

/**
 * Client que respon sol: per cada `publish` emet la resposta del `handler` com
 * si fos el plugin DynSec. Un `Error` es tradueix a `responses[].error`.
 */
function autoClient(handler: (command: Record<string, unknown>) => unknown): FakeMqttClient {
  const client = createFakeMqttClient();
  client.publish.mockImplementation((...args: unknown[]) => {
    const body = JSON.parse(String(args[1])) as { commands: Record<string, unknown>[] };
    const command = body.commands[0]!;
    const result = handler(command);
    const entry =
      result instanceof Error
        ? { command: command.command, error: result.message }
        : { command: command.command, data: result };
    client.emit("message", RESP_TOPIC, Buffer.from(JSON.stringify({ responses: [entry] })));
    return client;
  });
  return client;
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("dynsecCommand", () => {
  it("publica el comandament i resol la resposta que hi correspon", async () => {
    const client = createFakeMqttClient();
    const promise = dynsecCommand(asMqttClient(client), { command: "getRole", rolename: "r1" });

    expect(client.subscribe).toHaveBeenCalledWith(RESP_TOPIC, { qos: 1 }, expect.any(Function));
    expect(client.publish).toHaveBeenCalledWith(
      REQ_TOPIC,
      JSON.stringify({ commands: [{ command: "getRole", rolename: "r1" }] }),
      { qos: 1 },
    );

    const response = { responses: [{ command: "getRole", data: { role: { rolename: "r1" } } }] };
    client.emit("message", RESP_TOPIC, Buffer.from(JSON.stringify(response)));

    await expect(promise).resolves.toEqual(response);
    expect(client.listenerCount("message")).toBe(0);
  });

  it("ignora JSON malformat i respostes d'un altre comandament", async () => {
    const client = createFakeMqttClient();
    const promise = dynsecCommand(asMqttClient(client), { command: "createRole" });

    client.emit("message", RESP_TOPIC, Buffer.from("{no és json"));
    client.emit("message", RESP_TOPIC, Buffer.from(JSON.stringify({})));
    client.emit(
      "message",
      RESP_TOPIC,
      Buffer.from(JSON.stringify({ responses: [{ command: "deleteRole" }] })),
    );

    let settled = false;
    void promise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    client.emit(
      "message",
      RESP_TOPIC,
      Buffer.from(JSON.stringify({ responses: [{ command: "createRole", data: {} }] })),
    );
    await expect(promise).resolves.toEqual({ responses: [{ command: "createRole", data: {} }] });
  });

  it("rebutja amb l'error que retorna DynSec", async () => {
    const client = createFakeMqttClient();
    const promise = dynsecCommand(asMqttClient(client), { command: "createRole" });

    client.emit(
      "message",
      RESP_TOPIC,
      Buffer.from(JSON.stringify({ responses: [{ command: "createRole", error: "Role exists" }] })),
    );

    await expect(promise).rejects.toThrow("Role exists");
    expect(client.listenerCount("message")).toBe(0);
  });

  it("rebutja en esgotar el timeout i deixa d'escoltar", async () => {
    vi.useFakeTimers();
    const client = createFakeMqttClient();
    const promise = dynsecCommand(asMqttClient(client), { command: "slowRole" }, 8000);
    const assertion = expect(promise).rejects.toThrow("dynsec timeout: slowRole");

    await vi.advanceTimersByTimeAsync(8000);

    await assertion;
    expect(client.listenerCount("message")).toBe(0);
  });
});

describe("dynsecConnect", () => {
  it("resol quan el broker connecta, amb la identitat indicada", async () => {
    const client = createFakeMqttClient();
    mqttMock.connect.mockReturnValue(client);

    const promise = dynsecConnect("admin", "secret");
    client.emit("connect");

    await expect(promise).resolves.toBe(client);
    expect(mqttMock.connect).toHaveBeenCalledWith(
      config.MQTT_BROKER_URL,
      expect.objectContaining({
        username: "admin",
        password: "secret",
        reconnectPeriod: 0,
        connectTimeout: 3000,
      }),
    );
  });

  it("rebutja si el broker retorna error", async () => {
    const client = createFakeMqttClient();
    mqttMock.connect.mockReturnValue(client);

    const promise = dynsecConnect("admin", "secret");
    client.emit("error", new Error("Connection refused"));

    await expect(promise).rejects.toThrow("Connection refused");
  });

  it("rebutja i tanca el client si no connecta dins del timeout", async () => {
    vi.useFakeTimers();
    const client = createFakeMqttClient();
    mqttMock.connect.mockReturnValue(client);

    const promise = dynsecConnect("admin", "secret");
    const assertion = expect(promise).rejects.toThrow("connect timeout");

    await vi.advanceTimersByTimeAsync(4000);

    await assertion;
    expect(client.end).toHaveBeenCalledWith(true);
  });
});

describe("ensureRole", () => {
  it("no toca res si el rol ja té exactament les ACLs demanades", async () => {
    const client = autoClient((command) => {
      if (command.command === "createRole") {
        return new Error("Role already exists");
      }
      if (command.command === "getRole") {
        return { role: { acls: [{ acltype: "publishClientSend", topic: "t/1" }] } };
      }
      return {};
    });

    await ensureRole(asMqttClient(client), "rol", [{ acltype: "publishClientSend", topic: "t/1" }]);

    expect(sentCommands(client).map((c) => c.command)).toEqual(["createRole", "getRole"]);
  });

  it("substitueix la llista sencera quan hi ha ACLs de més o de menys", async () => {
    const client = autoClient((command) => {
      if (command.command === "createRole") {
        return new Error("Role already exists");
      }
      if (command.command === "getRole") {
        return {
          role: {
            acls: [
              { acltype: "subscribePattern", topic: "antic/#" },
              { acltype: "publishClientSend", topic: "t/1" },
              { acltype: "publishClientSend", topic: "t/1" },
            ],
          },
        };
      }
      return {};
    });

    await ensureRole(asMqttClient(client), "rol", [
      { acltype: "publishClientSend", topic: "t/1", allow: true },
    ]);

    const modify = sentCommands(client).find((c) => c.command === "modifyRole");
    expect(modify).toEqual({
      command: "modifyRole",
      rolename: "rol",
      acls: [{ acltype: "publishClientSend", topic: "t/1", allow: true }],
    });
  });

  it("si `modifyRole` falla, afegeix només les ACLs que falten", async () => {
    const client = autoClient((command) => {
      if (command.command === "createRole") {
        return new Error("Role already exists");
      }
      if (command.command === "getRole") {
        return { role: { acls: [{ acltype: "subscribePattern", topic: "#" }] } };
      }
      if (command.command === "modifyRole") {
        return new Error("Unknown command");
      }
      return {};
    });

    await ensureRole(asMqttClient(client), "rol", [
      { acltype: "publishClientSend", topic: "t/1", allow: true },
    ]);

    const added = sentCommands(client).filter((c) => c.command === "addRoleACL");
    expect(added).toEqual([
      {
        command: "addRoleACL",
        rolename: "rol",
        acltype: "publishClientSend",
        topic: "t/1",
        allow: true,
      },
    ]);
  });

  it("tracta un rol il·legible com si no tingués cap ACL", async () => {
    const client = autoClient((command) => {
      if (command.command === "createRole") {
        return new Error("Role exists");
      }
      if (command.command === "getRole") {
        return new Error("Role not found");
      }
      return {};
    });

    await ensureRole(asMqttClient(client), "rol", [{ acltype: "publishClientSend", topic: "t/1" }]);

    const commands = sentCommands(client);
    expect(commands.map((c) => c.command)).toEqual(["createRole", "getRole", "modifyRole"]);
    expect(commands[2]!.acls).toEqual([
      { acltype: "publishClientSend", topic: "t/1", allow: true },
    ]);
  });
});

describe("ensureClient", () => {
  it("crea el client si no existeix", async () => {
    const client = autoClient(() => ({}));

    await ensureClient(asMqttClient(client), "278_GI_001", "pw", "owntracks-device");

    expect(sentCommands(client)).toEqual([
      {
        command: "createClient",
        username: "278_GI_001",
        password: "pw",
        roles: [{ rolename: "owntracks-device" }],
      },
    ]);
  });

  it("si el client ja existeix, n'actualitza la contrasenya", async () => {
    const client = autoClient((command) =>
      command.command === "createClient" ? new Error("Client exists") : {},
    );

    await ensureClient(asMqttClient(client), "278_GI_001", "nova", "owntracks-device");

    expect(sentCommands(client).map((c) => c.command)).toEqual([
      "createClient",
      "setClientPassword",
    ]);
    expect(sentCommands(client)[1]).toEqual({
      command: "setClientPassword",
      username: "278_GI_001",
      password: "nova",
    });
  });

  it("no propaga errors si tampoc no es pot canviar la contrasenya", async () => {
    const client = autoClient(() => new Error("Broker error"));

    await expect(
      ensureClient(asMqttClient(client), "278_GI_001", "pw", "owntracks-device"),
    ).resolves.toBeUndefined();
  });
});
