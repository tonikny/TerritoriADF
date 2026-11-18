// Rutes de tracking OwnTracks: activar/descarregar config, estat, posicions i stream SSE.
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { mqttUsers, users, adfs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { ApiHandler, ApiRequest } from "../types.js";
import { encrypt, decrypt } from "../utils/crypto.js";
import {
  isAvailable,
  createMqttUser,
  deleteMqttUser,
  getPositions,
  getPositionsRevision,
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
  return res.json({ positions: visiblePositions(req.user!) });
};

/** Filtre de visibilitat compartit per `/positions` i `/stream`.
 *  Es recorre la taula d'usuaris (petita) en lloc del mapa de posicions: així n'hi ha prou
 *  amb un sol bucle i cap mapa intermedi. */
function visiblePositions(user: NonNullable<ApiRequest["user"]>): Record<string, LocationData> {
  const all = getPositions();
  const perms = permissionsFor(user.role);
  const viewAll = perms.includes("view_all_positions");

  const adfIds = new Set<number>();
  if (!viewAll && user.adf_id !== null) {
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

  const obj: Record<string, LocationData> = {};
  if (!viewAll && adfIds.size === 0) {
    return obj;
  }

  const allUsers = db.select({ username: users.username, adf_id: users.adf_id }).from(users).all();
  for (const u of allUsers) {
    if (!viewAll && (u.adf_id === null || !adfIds.has(u.adf_id))) {
      continue;
    }
    const pos = all.get(mqttNameFor(u.username));
    if (pos) {
      obj[u.username] = pos;
    }
  }
  return obj;
}

// --- Stream SSE -------------------------------------------------------------------------
// El client rep un esdeveniment `positions` només quan el conjunt visible canvia, un `ping`
// cada 25 s com a heartbeat (proxies i mòbils tallen les connexions silencioses) i un `retry`
// perquè, en tancar-se la connexió, torni a connectar de seguida. Cada 5 minuts el servidor
// tanca la connexió: el client reconecta i els permisos/ADF es tornen a comprovar, de manera
// que un canvi de rol o d'ADF no queda congelat en una connexió oberta.
// Dins una connexió, els permisos només es recalculen quan canvia el mapa de posicions
// (comptador del servei MQTT); la resta de ticks només comparen un número.
const SSE_TICK_MS = 5_000;
const SSE_HEARTBEAT_MS = 25_000;
const SSE_MAX_AGE_MS = 5 * 60_000;

const stream: ApiHandler = (req, res) => {
  const user = req.user!;
  const reply = res._reply;
  if (!reply) {
    return res.status(500).json({ error: "Aquest servidor no suporta streaming" });
  }

  // A partir d'aquí la resposta la gestiona el handler: Fastify no hi envia res més.
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let revision = -1;
  let lastData = "";
  let lastWrite = Date.now();
  let closed = false;
  let tick: ReturnType<typeof setInterval> | null = null;
  let expiry: ReturnType<typeof setTimeout> | null = null;

  const write = (chunk: string) => {
    if (closed || reply.raw.writableEnded) {
      return;
    }
    reply.raw.write(chunk);
    lastWrite = Date.now();
  };

  // El filtre (rol, ADF pròpia i ADFs compartides) es resol aquí dins, de manera que les
  // consultes a `users`/`adfs` només es fan quan el mapa de posicions ha canviat.
  const pushPositions = () => {
    revision = getPositionsRevision();
    const data = JSON.stringify({ positions: visiblePositions(user) });
    if (data === lastData) {
      return;
    }
    lastData = data;
    write(`event: positions\ndata: ${data}\n\n`);
  };

  // Tanca la connexió: timers fora i socket tancat (el client reconecta al cap de 3 s).
  const close = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    if (expiry) {
      clearTimeout(expiry);
      expiry = null;
    }
    if (!reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  write("retry: 3000\n\n");
  pushPositions();

  tick = setInterval(() => {
    if (getPositionsRevision() !== revision) {
      pushPositions();
      return;
    }
    if (Date.now() - lastWrite >= SSE_HEARTBEAT_MS) {
      write(`event: ping\ndata: ${Date.now()}\n\n`);
    }
  }, SSE_TICK_MS);

  expiry = setTimeout(close, SSE_MAX_AGE_MS);
  reply.raw.on("close", close);
  reply.raw.on("error", close);
};

/** Activa OwnTracks per l'usuari actual: crea l'usuari MQTT (identitat aplanada), guarda la password xifrada, retorna .otrc. */
const enable: ApiHandler = async (req, res) => {
  // Rotar credencials és una mutació: mai per GET (prefetch, crawlers, enllaços).
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "no-store");
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
    // s'elimina el client antic a DynSec i es re-renomena.
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
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  // Conté la password MQTT: no ha de quedar en cap caché.
  res.setHeader("Cache-Control", "no-store");
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
  // Auto-curat: si la identitat MQTT desada difereix de l'actual, es recrea el client amb la
  // identitat nova. Si ja coincideix no es toca res: `setClientPassword` expulsa el
  // dispositiu del broker, i cridar-ho a cada consulta de configuració tallava el tracking.
  if (row.mqtt_username !== mqUsername) {
    try {
      await createMqttUser(mqUsername, password);
      await deleteMqttUser(row.mqtt_username);
    } catch {
      /* best-effort: la configuració es retorna igualment */
    }
    db.update(mqttUsers).set({ mqtt_username: mqUsername }).where(eq(mqttUsers.id, row.id)).run();
  }
  return res.json(buildOtrc(mqUsername, password));
};

/** Mode de monitoratge OwnTracks: 1 = canvis significatius (estalvi de bateria), 2 = moviment continu. */
const OWTRACKS_MONITORING = 1;

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
    monitoring: OWTRACKS_MONITORING,
    locatorDisplacement: 50,
    locatorInterval: 60,
  };
}

export default { status, positions, stream, enable, config: configHandler };
