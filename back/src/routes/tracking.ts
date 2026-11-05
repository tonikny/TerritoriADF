// Rutes de tracking OwnTracks: activar/descarregar config, estat i posicions.
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { mqttUsers, users, adfs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { ApiHandler } from "../types.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import {
  isAvailable,
  createMqttUser,
  deleteMqttUser,
  getPositions,
  mqttNameFor,
  type LocationData,
} from "../services/mqtt.js";
import { config } from "../utils/config.js";
import { permissionsFor } from "../permissions.js";

/** Retorna si el servei MQTT està disponible i si l'usuari té OwnTracks activat. */
const status: ApiHandler = async (req, res) => {
  const mqttRow = db
    .select()
    .from(mqttUsers)
    .where(and(eq(mqttUsers.user_id, req.user!.id), eq(mqttUsers.enabled, true)))
    .get();
  return res.json({ available: isAvailable(), enabled: !!mqttRow });
};

/** Retorna les posicions segons visibilitat: admin veu tot; la resta veu la seva ADF més,
 *  si té permis, les ADFs amb tracking_shared.
 *  Les posicions arriben clauades per la identitat MQTT aplanada (ex. "278_GI_011");
 *  es retornen clauades per l'username d'app (ex. "278/GI/011"). */
const positions: ApiHandler = async (req, res) => {
  const all = getPositions();
  const user = req.user!;
  const perms = permissionsFor(user.role);

  // Mapa identitat MQTT -> username d'app i ADF, de tots els usuaris.
  const allUsers = db.select({ username: users.username, adf_id: users.adf_id }).from(users).all();
  const realName = new Map<string, string>();
  for (const u of allUsers) {
    realName.set(mqttNameFor(u.username), u.username);
  }

  const obj: Record<string, LocationData> = {};
  if (perms.includes("view_all_positions")) {
    for (const [mqName, pos] of all) {
      const username = realName.get(mqName);
      if (username) {
        obj[username] = pos;
      }
    }
    return res.json({ positions: obj });
  }

  const adfIds = new Set<number>();
  if (user.adf_id !== null) {
    adfIds.add(user.adf_id);
    if (perms.includes("view_shared_positions")) {
      const shared = db
        .select({ id: adfs.id })
        .from(adfs)
        .where(eq(adfs.tracking_shared, true))
        .all();
      for (const a of shared) {
        adfIds.add(a.id);
      }
    }
  }
  if (adfIds.size === 0) {
    return res.json({ positions: {} });
  }

  const allowed = new Set<string>();
  for (const u of allUsers) {
    if (u.adf_id !== null && adfIds.has(u.adf_id)) {
      allowed.add(mqttNameFor(u.username));
    }
  }
  for (const [mqName, pos] of all) {
    if (allowed.has(mqName)) {
      const username = realName.get(mqName);
      if (username) {
        obj[username] = pos;
      }
    }
  }
  return res.json({ positions: obj });
};

/** Activa OwnTracks per l'usuari actual: crea l'usuari MQTT (identitat aplanada), guarda la password xifrada, retorna .otrc. */
const enable: ApiHandler = async (req, res) => {
  const userId = req.user!.id;
  const username = req.user!.username;
  const mqUsername = mqttNameFor(username);
  const existing = db.select().from(mqttUsers).where(eq(mqttUsers.user_id, userId)).get();
  const password = randomBytes(16).toString("hex");

  try {
    await createMqttUser(mqUsername, password);
  } catch (err) {
    return res
      .status(503)
      .json({ error: `MQTT no disponible: ${err instanceof Error ? err.message : String(err)}` });
  }

  if (existing) {
    // Auto-curat: si l'identitat MQTT emmagatzemada difereix de la identitat aplanada actual,
    // s'elimina el client antic a DynSec i es re-renomen.
    if (existing.mqtt_username !== mqUsername) {
      try {
        await deleteMqttUser(existing.mqtt_username);
      } catch {
        /* client antic pot no existir */
      }
    }
    db.update(mqttUsers)
      .set({ mqtt_password_enc: encrypt(password), mqtt_username: mqUsername, enabled: true })
      .where(eq(mqttUsers.id, existing.id))
      .run();
  } else {
    db.insert(mqttUsers)
      .values({
        id: randomBytes(16).toString("hex"),
        user_id: userId,
        mqtt_username: mqUsername,
        mqtt_password_enc: encrypt(password),
        enabled: true,
      })
      .run();
  }
  return res.json(buildOtrc(mqUsername, password));
};

/** Descarrega el .otrc si OwnTracks ja està activat (desxifra la password de la DB). */
const configHandler: ApiHandler = async (req, res) => {
  const userId = req.user!.id;
  const username = req.user!.username;
  const mqUsername = mqttNameFor(username);
  const row = db
    .select()
    .from(mqttUsers)
    .where(and(eq(mqttUsers.user_id, userId), eq(mqttUsers.enabled, true)))
    .get();

  if (!row || !row.mqtt_password_enc) {
    return res.status(400).json({ error: "OwnTracks no activat" });
  }
  const password = decrypt(row.mqtt_password_enc);
  if (!password) {
    return res.status(500).json({ error: "No es pot desxifrar. Torna a activar." });
  }
  try {
    await createMqttUser(mqUsername, password);
  } catch {
    /* tornem la config igualment */
  }
  // Auto-curat: alinha la identitat MQTT emmagatzemada amb la identitat aplanada actual.
  if (row.mqtt_username !== mqUsername) {
    try {
      await deleteMqttUser(row.mqtt_username);
    } catch {
      /* client antic pot no existir */
    }
    db.update(mqttUsers).set({ mqtt_username: mqUsername }).where(eq(mqttUsers.id, row.id)).run();
  }
  return res.json(buildOtrc(mqUsername, password));
};

/** Genera l'objecte de configuració OwnTracks (.otrc). */
function buildOtrc(username: string, password: string) {
  return {
    _type: "configuration",
    auth: true,
    username,
    password,
    host: config.OTRC_HOST ?? config.BASE_DOMAIN_URL,
    port: config.OTRC_PORT,
    tls: config.OTRC_TLS,
    mqttProtocolLevel: 4,
    clientId: username,
    pubTopicBase: `${config.MQTT_TOPIC_PREFIX}/${username}`,
    cmd: true,
    monitoring: 1,
    locatorDisplacement: 50,
    locatorInterval: 60,
  };
}

export default { status, positions, enable, config: configHandler };
