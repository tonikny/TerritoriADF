/* eslint-disable @typescript-eslint/no-explicit-any -- adapter Express simplificat, vegeu types.ts */
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";

import overpass from "./routes/overpass.js";
import sendToTelegram from "./routes/sendToTelegram.js";
import route from "./routes/route.js";
import municipi from "./routes/municipi.js";
import municipisList from "./routes/municipis.js";
import adfBoundaries from "./routes/adfBoundaries.js";
import boundary from "./routes/boundary.js";
import hidrants from "./routes/hidrants.js";
import incidencies from "./routes/incidencies.js";
import { login, me, logout, changePassword } from "./routes/auth.js";
import access from "./routes/access.js";
import users, { accessLink as userAccessLink } from "./routes/users.js";
import tracking from "./routes/tracking.js";
import trackingSharing from "./routes/trackingSharing.js";
import telegram from "./routes/telegram.js";
import telegramWebhook from "./routes/telegramWebhook.js";
import osm from "./routes/osm.js";
import appConfig from "./routes/appConfig.js";
import { startMqttService, stopMqttService } from "./services/mqtt.js";
import sqlite, { db } from "./db/index.js";
import { users as usersTable } from "./db/schema.js";
import { eq } from "drizzle-orm";

import type { ApiHandler, ApiRequest } from "./types.js";
import { config } from "./utils/config.js";
import { AppError } from "./errors.js";
import { permissionsFor, type Permission } from "./permissions.js";
import { logger } from "./utils/logger.js";

const app = Fastify({
  loggerInstance: logger.child({ module: "server", operation: "api" }),
  // Darrere d'un proxy invers, X-Forwarded-For és la IP real (necessari per als límits
  // de login). Desactivat per defecte: només s'activa amb TRUST_PROXY=true.
  trustProxy: config.TRUST_PROXY,
});

app.register(fastifyCookie);

app.register(fastifyJwt, {
  secret: config.JWT_SECRET,
  cookie: {
    cookieName: "auth_token",
    signed: false,
  },
});

app.addHook("onRequest", (request, _reply, done) => {
  request.log = request.log.child({ module: "http", operation: request.url.split("?")[0] });
  done();
});

app.setErrorHandler((error: any, request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  if (error.statusCode) {
    return reply.status(error.statusCode).send({ error: error.message });
  }

  request.log.error(error);
  return reply.status(500).send({ error: "Internal server error (500)" });
});

/**
 * Adapter de resposta (simplificat, sense subdominis)
 */
interface ResAdapter {
  status: (code: number) => ResAdapter;
  json: (data: any) => void;
  send: (data: any) => void;
  end: () => void;
  setHeader: (name: string, value: string) => void;
  _userToSign?: { id: string; username: string; adf_id: number | null; role: string };
  _clearCookie?: boolean;
}

function createRes(reply: FastifyReply, app: any, request: FastifyRequest): ResAdapter {
  const adapter: ResAdapter = {
    status(code: number) {
      reply.code(code);
      return adapter;
    },

    json(data: any) {
      // Si el handler ha marcat un usuari per signar (cas del login)
      if (adapter._userToSign) {
        // Caducitat explícita: el JWT viu el mateix que la cookie. Només viatja a la
        // cookie httpOnly; no es retorna al cos (evita que quedi a localStorage o logs).
        const token = app.jwt.sign(adapter._userToSign, { expiresIn: "30d" });

        const cookieOptions: any = {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30, // 30 dies
        };

        // Si estem en producció o l'usuari accedeix per HTTPS, marquem la cookie com a segura
        if (
          process.env.NODE_ENV === "production" ||
          request.protocol === "https" ||
          request.headers["x-forwarded-proto"] === "https"
        ) {
          cookieOptions.secure = true;
        }

        reply.setCookie("auth_token", token, cookieOptions);
      }

      // Si el handler ha demanat esborrar la cookie (cas del logout)
      if (adapter._clearCookie) {
        reply.clearCookie("auth_token", {
          path: "/",
        });
      }

      reply.send(data);
    },

    send(data: any) {
      reply.send(data);
    },

    end() {
      reply.send();
    },

    setHeader(name: string, value: string) {
      reply.header(name, value);
    },
  };

  return adapter;
}

/**
 * Usuari de sessió fresc de la BD. El JWT només serveix per identificar l'usuari (id):
 * el rol i l'ADF es llegeixen de `users` a cada petició, així un canvi de rol o un usuari
 * esborrat tenen efecte immediat en lloc d'esperar l'expiració de la cookie (30 dies).
 */
function sessionUser(payload: any): NonNullable<ApiRequest["user"]> | undefined {
  const id = payload?.id;
  if (typeof id !== "string") {
    return undefined;
  }

  const row = db.select().from(usersTable).where(eq(usersTable.id, id)).get();
  if (!row) {
    return undefined;
  }

  return {
    id: row.id,
    username: row.username,
    adf_id: row.adf_id,
    role: row.role ?? "voluntari",
  };
}

/**
 * Wrapper per adaptar handlers a Fastify
 */
function wrap(handler: ApiHandler, options: { protected?: boolean } = {}) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    let user: NonNullable<ApiRequest["user"]> | undefined;

    try {
      await request.jwtVerify();
      user = sessionUser((request as any).user);
    } catch {
      user = undefined;
    }

    if (options.protected && !user) {
      return reply.status(401).send({ error: "Sessió caducada o no vàlida" });
    }

    if (user && options.protected) {
      const isMutation = ["POST", "PUT", "DELETE"].includes(request.method);
      const query = request.query as any;
      const targetAdfId = Number(query?.adf || (request.body as any)?.adf_id);
      const perms = new Set(permissionsFor(user.role));
      const url = request.url.split("?")[0];

      // Permís requerit per operació (GET sense mutació no requereix cap)
      const required: Permission | null =
        url.endsWith("/sync") || url.includes("/api/osm")
          ? "sync_osm"
          : url.includes("/incidencies")
            ? isMutation
              ? "create_incidencia"
              : null
            : url.includes("/hidrants")
              ? request.method === "DELETE"
                ? "delete_hydrant"
                : request.method === "POST"
                  ? "create_hydrant"
                  : request.method === "PUT"
                    ? "edit_hydrant"
                    : null
              : null;

      if (required && !perms.has(required)) {
        return reply.status(403).send({ error: "No tens permisos per realitzar aquesta acció" });
      }

      // Propietat de l'ADF: només la pròpia (admin exempte)
      if (
        user.role !== "admin" &&
        isMutation &&
        !isNaN(targetAdfId) &&
        user.adf_id !== targetAdfId
      ) {
        return reply.status(403).send({ error: "No tens permisos per editar aquesta ADF" });
      }
    }

    const req: ApiRequest = {
      method: request.method,
      query: request.query,
      body: request.body,
      headers: request.headers,
      params: request.params,
      url: request.url,
      ip: request.ip,
      log: request.log,
      user,
    };

    const res = createRes(reply, app, request);

    await handler(req, res);
  };
}

/**
 * RUTES
 */
const routes = [
  { path: "/api/auth/login", handler: login },
  { path: "/api/auth/logout", handler: logout },
  { path: "/api/auth/me", handler: me },
  { path: "/api/auth/password", handler: changePassword, protected: true },
  { path: "/api/auth/access/:token", handler: access },
  { path: "/api/config", handler: appConfig },
  { path: "/api/overpass", handler: overpass },
  { path: "/api/hidrants/sync", handler: hidrants, protected: true },
  { path: "/api/hidrants", handler: hidrants },
  { path: "/api/hidrants/:id", handler: hidrants },
  { path: "/api/sendToTelegram", handler: sendToTelegram },
  { path: "/api/route", handler: route },
  { path: "/api/adf", handler: municipi },
  { path: "/api/adfs", handler: municipisList },
  { path: "/api/adfs/:id", handler: municipisList },
  { path: "/api/adfs/:id/boundaries", handler: adfBoundaries, protected: true },
  { path: "/api/adf/boundary", handler: boundary },
  { path: "/api/incidencies", handler: incidencies },
  { path: "/api/incidencies/:id", handler: incidencies },
  { path: "/api/incidencies/:id/events", handler: incidencies },
  { path: "/api/tracking/status", handler: tracking.status, protected: true },
  { path: "/api/tracking/positions", handler: tracking.positions, protected: true },
  { path: "/api/tracking/enable", handler: tracking.enable, protected: true },
  { path: "/api/tracking/config", handler: tracking.config, protected: true },
  { path: "/api/adfs/:id/tracking-sharing", handler: trackingSharing, protected: true },
  { path: "/api/adfs/:id/telegram", handler: telegram.handle, protected: true },
  { path: "/api/adfs/:id/telegram/status", handler: telegram.status, protected: true },
  { path: "/api/adfs/:id/telegram/link", handler: telegram.link, protected: true },
  { path: "/api/adfs/:id/telegram/test", handler: telegram.test, protected: true },
  { path: "/api/telegram/webhook/:secret", handler: telegramWebhook },
  { path: "/api/users", handler: users, protected: true },
  { path: "/api/users/:id", handler: users, protected: true },
  { path: "/api/users/:id/access-link", handler: userAccessLink, protected: true },
  { path: "/api/osm/status", handler: osm, protected: true },
  { path: "/api/osm/pending", handler: osm, protected: true },
  { path: "/api/osm/push-sync", handler: osm, protected: true },
  { path: "/api/osm/push-selected", handler: osm, protected: true },
  { path: "/api/osm/discard-selected", handler: osm, protected: true },
  { path: "/api/osm/conflicts", handler: osm, protected: true },
  { path: "/api/osm/conflicts/osc", handler: osm, protected: true },
  { path: "/api/osm/conflicts/resolve", handler: osm, protected: true },
  { path: "/api/osm/missing/purge", handler: osm, protected: true },
  { path: "/api/osm/pull-hydrant", handler: osm, protected: true },
  { path: "/api/osm/diff/:id", handler: osm, protected: true },
  { path: "/api/osm/reviews", handler: osm, protected: true },
];

routes.forEach((r) => {
  const isMutation =
    (r.path.includes("/hidrants") || r.path.includes("/incidencies")) &&
    (r.handler === hidrants || r.handler === incidencies);

  app.all(r.path, async (request, reply) => {
    const needsAuth =
      r.protected || (isMutation && ["POST", "PUT", "DELETE"].includes(request.method));
    return wrap(r.handler, { protected: needsAuth })(request, reply);
  });
});

/**
 * START SERVER
 */
const start = async () => {
  try {
    await app.listen({
      host: "0.0.0.0",
      port: config.PORT,
    });
    app.log.child({ operation: "startup" }).info({ port: config.PORT }, "API running");

    startMqttService().catch((err: Error) => {
      app.log
        .child({ operation: "startup" })
        .warn({ err: err.message }, "Servei MQTT no disponible");
    });
  } catch (err) {
    app.log.child({ operation: "startup" }).fatal({ err }, "Error arrencant servidor");
    process.exit(1);
  }
};

void start();

// Aturada ordenada (Ctrl+C / SIGTERM): tanca Fastify, MQTT i SQLite perquè tsx watch surti net.
let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.child({ operation: "shutdown" }).info("Aturant servei...");
  try {
    void app.close();
  } catch {
    /* noop */
  }
  stopMqttService();
  try {
    sqlite.close();
  } catch {
    /* noop */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
