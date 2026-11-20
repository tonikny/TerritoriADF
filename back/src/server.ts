import sqlite from "./db/index.js";
import { buildApp } from "./app.js";
import { config } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { startMqttService, stopMqttService } from "./services/mqtt.js";

/**
 * Punt d'entrada del procés: construeix l'app (`buildApp()`), escolta el port,
 * arrenca MQTT i instal·la l'aturada ordenada. Tota la resta (plugins, rutes,
 * autorització) viu a `app.ts` i als mòduls de `routes/`, de manera que un test
 * pot importar `buildApp()` sense obrir cap port.
 */
const start = async (): Promise<void> => {
  const app = await buildApp();

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

  // Aturada ordenada (Ctrl+C / SIGTERM): tanca Fastify, MQTT i SQLite perquè
  // tsx watch surti net.
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
};

void start().catch((err: unknown) => {
  logger.child({ operation: "startup" }).fatal({ err }, "No s'ha pogut arrencar el servei");
  process.exit(1);
});
