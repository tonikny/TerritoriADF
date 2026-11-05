// Servei MQTT: connexió persistent a Mosquitto, subscripció a owntracks/#,
// emmagatzematge en memòria de les últimes posicions, i gestió d'usuaris via DynSec.
import mqtt from "mqtt";
import { z } from "zod";
import { config } from "../utils/config.js";
import { APP_ID } from "../utils/appInfo.js";
import { dynsecConnect, dynsecCommand, ensureRole, ensureClient } from "./dynsec.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "mqtt", operation: "service" });

const RECONNECT_BASE = 5000;
const RECONNECT_MAX = 60000;
const RECONNECT_FACTOR = 2;

export interface LocationData {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  battery: number;
  receivedAt: number;
}

/** Converteix un username d'app (XXX/YYY o XXX/GI/YYY) a una identitat MQTT sense
 *  barres ("278_GI_001"). El broker MQTT (DynSec, ACL %u als topics) no encamina
 *  publicacions quan el username conté "/"; per això la identitat MQTT va aplanada
 *  i es mapeja de nou a l'username real a la capa d'API. */
export function mqttNameFor(username: string): string {
  return username.replaceAll("/", "_");
}

// Schema Zod per validar payloads d'OwnTracks (només _type=location).
const owntracksSchema = z.object({
  _type: z.literal("location"),
  lat: z.number(),
  lon: z.number(),
  acc: z.number().optional().default(0),
  batt: z.number().optional().default(0),
  ts: z.number().optional(),
  tst: z.number().optional(),
  t: z
    .union([
      z.literal("p"),
      z.literal("c"),
      z.literal("t"),
      z.literal("b"),
      z.literal("r"),
      z.literal("u"),
    ])
    .optional(),
  tid: z.string().optional(),
});

/** Gestiona el cicle de vida del client MQTT i les posicions rebudes.
 *  Singleton: exportat com a `mqttService`. */
class MqttService {
  private client: mqtt.MqttClient | null = null;
  private adminClient: mqtt.MqttClient | null = null;
  private positions = new Map<string, LocationData>();
  private available = false;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;

  /** Inicia: bootstrap DynSec, connexió com backend, timer de neteja. */
  async start(): Promise<void> {
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    await this.bootstrap();
    await this.connectBackend();
    this.pruneTimer = setInterval(() => this.prunePositions(900), 120000);
  }

  /** Atura tot: clients MQTT, timers, i neteja posicions. */
  stop(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
    if (this.adminClient) {
      this.adminClient.end(true);
      this.adminClient = null;
    }
    this.available = false;
    this.positions.clear();
  }

  getPositions(): Map<string, LocationData> {
    return this.positions;
  }
  isAvailable(): boolean {
    return this.available;
  }

  /** Crea o actualitza un usuari MQTT amb rol owntracks-device. */
  async createMqttUser(username: string, password: string): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error("MQTT no connectat");
    }
    try {
      await dynsecCommand(this.client, {
        command: "createClient",
        username,
        password,
        roles: [{ rolename: "owntracks-device" }],
      });
      log.info({ username }, "MQTT user created");
    } catch {
      await dynsecCommand(this.client, { command: "setClientPassword", username, password });
      log.info({ username }, "MQTT user password updated");
    }
  }

  /** Elimina un usuari MQTT del Dynamic Security. */
  async deleteMqttUser(username: string): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error("MQTT no connectat");
    }
    await dynsecCommand(this.client, { command: "deleteClient", username });
    log.info({ username }, "MQTT user deleted");
  }

  /** Inicialitza DynSec si no ho està: admin, roles (owntracks-device, backend-service), client backend. */
  private async bootstrap(): Promise<void> {
    let anon: mqtt.MqttClient | undefined;
    try {
      anon = await dynsecConnect();
    } catch {
      log.debug("No anonymous connect on MQTT broker");
    }

    if (anon && !anon.disconnected) {
      try {
        await dynsecCommand(anon, {
          command: "init",
          configfile: "/mosquitto/data/dynamic-security.json",
        });
        anon.end();
        this.adminClient = await dynsecConnect(
          config.MQTT_ADMIN_USERNAME,
          config.MQTT_ADMIN_PASSWORD,
        );
        await ensureRole(this.adminClient, "owntracks-device", [
          { acltype: "publishClientSend", topic: `${config.MQTT_TOPIC_PREFIX}/%u/#`, allow: true },
        ]);
        await ensureRole(this.adminClient, "backend-service", [
          { acltype: "subscribePattern", topic: `${config.MQTT_TOPIC_PREFIX}/#`, allow: true },
          { acltype: "publishClientSend", topic: "$CONTROL/dynamic-security/v1", allow: true },
          { acltype: "publishClientReceive", topic: "$CONTROL/dynamic-security/v1/#", allow: true },
          { acltype: "subscribePattern", topic: "$CONTROL/dynamic-security/v1/#", allow: true },
        ]);
        await ensureClient(
          this.adminClient,
          config.MQTT_BACKEND_USERNAME,
          config.MQTT_BACKEND_PASSWORD,
          "backend-service",
        );
      } catch (err) {
        log.warn({ err }, "MQTT DynSec bootstrap failed");
      } finally {
        if (this.adminClient) {
          this.adminClient.end();
          this.adminClient = null;
        }
        anon.end();
      }
    }
  }

  private getReconnectDelay(): number {
    return Math.min(
      RECONNECT_BASE * Math.pow(RECONNECT_FACTOR, this.reconnectAttempts),
      RECONNECT_MAX,
    );
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldReconnect) {
      return;
    }
    const delay = this.getReconnectDelay();
    this.reconnectAttempts++;
    log.debug(`MQTT reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectBackend();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /** Connecta com a backend, es subscriu a owntracks/# i comença a rebre posicions. */
  private connectBackend(): Promise<void> {
    return new Promise((resolve) => {
      if (this.client) {
        try {
          this.client.removeAllListeners();
          this.client.end(true);
        } catch {
          /* ignore */
        }
      }
      this.client = mqtt.connect(config.MQTT_BROKER_URL, {
        clientId: `${APP_ID}-backend`,
        username: config.MQTT_BACKEND_USERNAME,
        password: config.MQTT_BACKEND_PASSWORD,
        reconnectPeriod: 0,
        connectTimeout: 5000,
      });

      let resolved = false;
      const resolveOnce = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };
      const startupTimer = setTimeout(resolveOnce, 6000);

      this.client.on("connect", () => {
        clearTimeout(startupTimer);
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        this.available = true;
        log.info("MQTT broker connected");
        this.client!.subscribe(`${config.MQTT_TOPIC_PREFIX}/#`, { qos: 1 }, (err) => {
          if (err) {
            log.error({ err }, "MQTT subscribe error");
          }
        });
        resolveOnce();
      });

      this.client.on("message", (topic, payload) => {
        try {
          const prefixLength = config.MQTT_TOPIC_PREFIX.split("/").filter(Boolean).length;
          // El topic és ${prefix}/<identitatMQTT> (ex. owntracks/hidrants/278_GI_011, o amb
          // un sub-topic de dispositiu). La identitat MQTT és el primer segment després
          // del prefix; la resta del topic (device, "status") s'ignora.
          const username = topic.split("/")[prefixLength];
          if (!username) {
            return;
          }
          // Algunes versions/vehicles d'OwnTracks (Android) publiquen totes les posicions
          // amb retain=true per refrescar la darrera posició. Aquestes SÍ són posicions
          // vives; la guarda d'edat (15 min) descarta els replays antics del broker.
          const raw = JSON.parse(payload.toString());
          if (raw._type !== "location") {
            return;
          }
          const parsed = owntracksSchema.safeParse(raw);
          if (!parsed.success) {
            return;
          }
          const { lat, lon, acc, batt, ts, tst } = parsed.data;
          const msgTime = ts || tst || Math.floor(Date.now() / 1000);
          // Descartem posicions antigues (> 15 min, mateix llindar que prunePositions):
          // garantim que fins que no arribin dades noves no surt cap usuari al mapa.
          if (Date.now() / 1000 - msgTime > 900) {
            return;
          }
          this.positions.set(username, {
            lat,
            lon,
            accuracy: acc,
            timestamp: msgTime,
            battery: batt,
            receivedAt: Date.now(),
          });
        } catch {
          /* ignore */
        }
      });

      this.client.on("error", (err) => {
        log.warn({ err }, "MQTT client error");
        this.available = false;
        clearTimeout(startupTimer);
        resolveOnce();
        this.scheduleReconnect();
      });
      this.client.on("close", () => {
        this.available = false;
        clearTimeout(startupTimer);
        resolveOnce();
        this.scheduleReconnect();
      });
      this.client.on("offline", () => {
        this.available = false;
      });
    });
  }

  /** Esborra posicions antigues (per defecte > 15 min). */
  private prunePositions(maxAgeSec = 900): void {
    const now = Date.now();
    for (const [user, pos] of this.positions) {
      if (now - pos.receivedAt > maxAgeSec * 1000) {
        this.positions.delete(user);
      }
    }
  }
}

export const mqttService = new MqttService();
export const startMqttService = () => mqttService.start();
export const stopMqttService = () => mqttService.stop();
export const getPositions = () => mqttService.getPositions();
export const isAvailable = () => mqttService.isAvailable();
export const createMqttUser = (u: string, p: string) => mqttService.createMqttUser(u, p);
export const deleteMqttUser = (u: string) => mqttService.deleteMqttUser(u);
