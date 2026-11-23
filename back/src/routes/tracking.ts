// Rutes de tracking OwnTracks: activar/descarregar config, estat, posicions i stream SSE.
import type { OtrcConfig, Position, TrackingStatus } from "@territoriadf/contracts/tracking";
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { AdfsRepository } from "../db/repositories/adfsRepository.js";
import { MqttUsersRepository } from "../db/repositories/mqttUsersRepository.js";
import { UsersRepository } from "../db/repositories/usersRepository.js";
import { permissionsFor } from "../permissions.js";
import type { SessionUser } from "../plugins/auth.js";
import { requireAuth } from "../plugins/authorize.js";
import {
  createMqttUser,
  deleteMqttUser,
  getPositions,
  getPositionsRevision,
  isAvailable,
  mqttNameFor,
  type LocationData,
} from "../services/mqtt.js";
import { config } from "../utils/config.js";
import { decrypt, encrypt } from "../utils/crypto.js";

/** Retorna si el servei MQTT està disponible i si l'usuari té OwnTracks activat. */
function isEnabledFor(userId: string): boolean {
  return !!MqttUsersRepository.findEnabledByUserId(userId);
}

/** Filtre de visibilitat compartit per `/positions` i `/stream`.
 *  Es recorre la taula d'usuaris (petita) en lloc del mapa de posicions: així n'hi ha prou
 *  amb un sol bucle i cap mapa intermedi. */
function visiblePositions(user: SessionUser): Record<string, LocationData> {
  const all = getPositions();
  const perms = permissionsFor(user.role);
  const viewAll = perms.includes("view_all_positions");

  const adfIds = new Set<number>();
  if (!viewAll && user.adf_id !== null) {
    adfIds.add(user.adf_id);
    if (perms.includes("view_shared_positions")) {
      for (const id of AdfsRepository.findTrackingSharedIds()) {
        adfIds.add(id);
      }
    }
  }

  const obj: Record<string, LocationData> = {};
  if (!viewAll && adfIds.size === 0) {
    return obj;
  }

  const allUsers = UsersRepository.findMemberships();
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

/** Mode de monitoratge OwnTracks: 1 = canvis significatius (estalvi de bateria), 2 = moviment continu. */
const OWTRACKS_MONITORING = 1;

/** Genera l'objecte de configuració OwnTracks (.otrc). */
function buildOtrc(username: string, password: string): OtrcConfig {
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

export function registerTrackingRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    "/api/tracking/status",
    {
      preHandler: [requireAuth],
      schema: { tags: ["tracking"], summary: "Estat d'OwnTracks de l'usuari" },
    },
    async (request, reply) => {
      const status: TrackingStatus = {
        available: isAvailable(),
        enabled: isEnabledFor(request.authUser!.id),
      };
      return reply.send(status);
    },
  );

  typed.get(
    "/api/tracking/positions",
    {
      preHandler: [requireAuth],
      schema: { tags: ["tracking"], summary: "Posicions visibles per a l'usuari" },
    },
    async (request, reply) => {
      const body: { positions: Record<string, Position> } = {
        positions: visiblePositions(request.authUser!),
      };
      return reply.send(body);
    },
  );

  typed.get(
    "/api/tracking/stream",
    {
      preHandler: [requireAuth],
      schema: { tags: ["tracking"], summary: "Stream SSE de posicions" },
    },
    (request, reply) => {
      const user = request.authUser!;

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
    },
  );

  /** Activa OwnTracks per l'usuari actual: crea l'usuari MQTT (identitat aplanada),
   *  guarda la password xifrada i retorna el .otrc. */
  typed.post(
    "/api/tracking/enable",
    {
      preHandler: [requireAuth],
      schema: { tags: ["tracking"], summary: "Activa OwnTracks" },
    },
    async (request, reply) => {
      // Rotar credencials és una mutació: mai per GET (prefetch, crawlers, enllaços).
      reply.header("Cache-Control", "no-store");
      const userId = request.authUser!.id;
      const username = request.authUser!.username;
      const mqUsername = mqttNameFor(username);
      const existing = MqttUsersRepository.findByUserId(userId);
      const password = randomBytes(16).toString("hex");

      try {
        await createMqttUser(mqUsername, password);
      } catch (err) {
        return reply.code(503).send({
          error: `MQTT no disponible: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      if (existing) {
        // Auto-curat: si l'identitat MQTT emmagatzemada difereix de la identitat aplanada
        // actual, s'elimina el client antic a DynSec i es re-renomena.
        if (existing.mqtt_username !== mqUsername) {
          try {
            await deleteMqttUser(existing.mqtt_username);
          } catch {
            /* client antic pot no existir */
          }
        }
        MqttUsersRepository.update(existing.id, {
          mqtt_password_enc: encrypt(password),
          mqtt_username: mqUsername,
          enabled: true,
        });
      } else {
        MqttUsersRepository.insert({
          id: randomBytes(16).toString("hex"),
          user_id: userId,
          mqtt_username: mqUsername,
          mqtt_password_enc: encrypt(password),
          enabled: true,
        });
      }
      return reply.send(buildOtrc(mqUsername, password));
    },
  );

  /** Descarrega el .otrc si OwnTracks ja està activat (desxifra la password de la DB). */
  typed.get(
    "/api/tracking/config",
    {
      preHandler: [requireAuth],
      schema: { tags: ["tracking"], summary: "Configuració OwnTracks (.otrc)" },
    },
    async (request, reply) => {
      // Conté la password MQTT: no ha de quedar en cap caché.
      reply.header("Cache-Control", "no-store");
      const userId = request.authUser!.id;
      const mqUsername = mqttNameFor(request.authUser!.username);
      const row = MqttUsersRepository.findEnabledByUserId(userId);

      if (!row || !row.mqtt_password_enc) {
        return reply.code(400).send({ error: "OwnTracks no activat" });
      }
      const password = decrypt(row.mqtt_password_enc);
      if (!password) {
        return reply.code(500).send({ error: "No es pot desxifrar. Torna a activar." });
      }
      // Auto-curat: si la identitat MQTT desada difereix de l'actual, es recrea el client amb
      // la identitat nova. Si ja coincideix no es toca res: `setClientPassword` expulsa el
      // dispositiu del broker, i cridar-ho a cada consulta de configuració tallava el tracking.
      if (row.mqtt_username !== mqUsername) {
        try {
          await createMqttUser(mqUsername, password);
          await deleteMqttUser(row.mqtt_username);
        } catch {
          /* best-effort: la configuració es retorna igualment */
        }
        MqttUsersRepository.update(row.id, { mqtt_username: mqUsername });
      }
      return reply.send(buildOtrc(mqUsername, password));
    },
  );
}
