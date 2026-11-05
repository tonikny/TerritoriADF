// API del Dynamic Security Plugin de Mosquitto via MQTT.
// Envia comandaments JSON a $CONTROL/dynamic-security/v1 i processa les respostes.
import mqtt from "mqtt";
import { randomUUID } from "node:crypto";
import { config } from "../utils/config.js";
import { APP_ID } from "../utils/appInfo.js";

const DYNSEC_TOPIC = "$CONTROL/dynamic-security/v1";
const DYNSEC_RESP_TOPIC = "$CONTROL/dynamic-security/v1/response";

/** Connexió efímera a Mosquitto per operacions DynSec (sense reconnexió). */
export function dynsecConnect(
  username?: string,
  password?: string,
  timeoutMs = 4000,
): Promise<mqtt.MqttClient> {
  return new Promise((resolve, reject) => {
    const c = mqtt.connect(config.MQTT_BROKER_URL, {
      clientId: `${APP_ID}-${username || "anon"}-${randomUUID().slice(0, 8)}`,
      username,
      password,
      reconnectPeriod: 0,
      connectTimeout: Math.min(timeoutMs - 1000, 3000),
    });
    const timer = setTimeout(() => {
      c.end(true);
      reject(new Error("connect timeout"));
    }, timeoutMs);
    c.once("connect", () => {
      clearTimeout(timer);
      resolve(c);
    });
    c.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/** Envia un comandament al Dynamic Security plugin i espera la resposta.
 *  Usa AbortController per gestionar el timeout sense listener leaks. */
export function dynsecCommand(
  client: mqtt.MqttClient,
  command: Record<string, unknown>,
  timeoutMs = 8000,
): Promise<unknown> {
  const cmdName = command.command as string;
  const ac = new AbortController();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ac.abort(new Error(`dynsec timeout: ${cmdName}`));
    }, timeoutMs);

    const onMsg = (topic: string, payload: Buffer) => {
      try {
        const resp = JSON.parse(payload.toString()) as {
          responses?: { command: string; error?: string }[];
        };
        const entry = resp.responses?.find((r) => r.command === cmdName);
        if (!entry) {
          return;
        }
        clearTimeout(timer);
        ac.signal.removeEventListener("abort", onAbort);
        client.removeListener("message", onMsg);
        if (entry.error) {
          reject(new Error(entry.error));
        } else {
          resolve(resp);
        }
      } catch {
        /* ignore */
      }
    };

    const onAbort = () => {
      client.removeListener("message", onMsg);
      reject(ac.signal.reason || new Error("aborted"));
    };

    ac.signal.addEventListener("abort", onAbort);
    client.on("message", onMsg);
    client.subscribe(DYNSEC_RESP_TOPIC, { qos: 1 }, () => {
      if (ac.signal.aborted) {
        return;
      }
      client.publish(DYNSEC_TOPIC, JSON.stringify({ commands: [command] }), { qos: 1 });
    });
  });
}

/** Crea un rol DynSec si no existeix i li assigna les ACLs indicades. */
export async function ensureRole(
  client: mqtt.MqttClient,
  rolename: string,
  acls: Record<string, unknown>[],
): Promise<void> {
  try {
    await dynsecCommand(client, { command: "createRole", rolename });
  } catch {
    /* exists */
  }
  for (const acl of acls) {
    try {
      await dynsecCommand(client, { command: "addRoleACL", rolename, acls: [acl] });
    } catch {
      /* exists */
    }
  }
}

/** Crea un client DynSec o n'actualitza la contrasenya si ja existeix. */
export async function ensureClient(
  client: mqtt.MqttClient,
  username: string,
  password: string,
  rolename: string,
): Promise<void> {
  try {
    await dynsecCommand(client, {
      command: "createClient",
      username,
      password,
      roles: [{ rolename }],
    });
  } catch {
    try {
      await dynsecCommand(client, { command: "setClientPassword", username, password });
    } catch {
      /* exists */
    }
  }
}
