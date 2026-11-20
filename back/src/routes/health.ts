import fs from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import sqlite from "../db/index.js";
import { mqttService } from "../services/mqtt.js";
import { logger } from "../utils/logger.js";

/**
 * Salut (`/healthz`) i preparació (`/readyz`).
 *
 * Són dos senyals diferents: `/healthz` només diu que el procés viu i respon HTTP
 * (sense tocar la BD ni el broker), mentre que `/readyz` comprova que la BD és
 * oberta, que les migracions del directori `drizzle/` ja s'hi han aplicat i que
 * `foreign_keys` està actiu en aquesta connexió. El healthcheck del contenidor
 * apunta a `/readyz`: així un contenidor amb l'esquema pendent no es declara sa.
 *
 * MQTT és opcional (el backend funciona sense broker), així que el seu estat
 * s'informa però no fa fallar la preparació.
 */

const log = logger.child({ module: "health", operation: "readyz" });

const JOURNAL_PATH = path.resolve(import.meta.dirname, "../../drizzle/meta/_journal.json");

interface JournalEntry {
  when?: number;
}

interface ExpectedMigrations {
  count: number;
  lastWhen: number;
}

/** Última migració que hauria d'estar aplicada segons el journal de Drizzle.
 *  Es desa en memòria quan la lectura va bé; un error no es cacheja. */
let expectedMigrations: ExpectedMigrations | null = null;

function readExpectedMigrations(): ExpectedMigrations | null {
  if (expectedMigrations) {
    return expectedMigrations;
  }
  try {
    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf8")) as {
      entries?: JournalEntry[];
    };
    const entries = Array.isArray(journal.entries) ? journal.entries : [];
    const lastWhen = entries.reduce((max, entry) => Math.max(max, Number(entry.when) || 0), 0);
    if (entries.length === 0) {
      return null;
    }
    expectedMigrations = { count: entries.length, lastWhen };
    return expectedMigrations;
  } catch (err) {
    log.warn({ err, path: JOURNAL_PATH }, "No s'ha pogut llegir el journal de migracions");
    return null;
  }
}

interface Check {
  status: "ok" | "fail" | "down";
  detail?: string;
  /** Un check opcional no fa fallar `/readyz`. */
  optional?: boolean;
  applied?: number;
  expected?: number;
}

function databaseCheck(): Check {
  try {
    sqlite.prepare("SELECT 1 AS ok").get();
  } catch (err) {
    return { status: "fail", detail: (err as Error).message };
  }

  if (Number(sqlite.pragma("foreign_keys", { simple: true })) !== 1) {
    return { status: "fail", detail: "PRAGMA foreign_keys desactivat en aquesta connexió" };
  }

  return { status: "ok" };
}

function migrationsCheck(): Check {
  const expected = readExpectedMigrations();
  if (!expected) {
    return { status: "fail", detail: "journal de migracions no disponible" };
  }

  try {
    const row = sqlite
      .prepare(
        "SELECT COUNT(*) AS applied, COALESCE(MAX(created_at), 0) AS last_applied FROM __drizzle_migrations",
      )
      .get() as { applied: number; last_applied: number };

    if (row.applied < expected.count || row.last_applied < expected.lastWhen) {
      return {
        status: "fail",
        detail: "hi ha migracions pendents",
        applied: row.applied,
        expected: expected.count,
      };
    }

    return { status: "ok", applied: row.applied, expected: expected.count };
  } catch (err) {
    return { status: "fail", detail: (err as Error).message };
  }
}

function mqttCheck(): Check {
  return mqttService.isAvailable()
    ? { status: "ok", optional: true }
    : { status: "down", optional: true, detail: "broker MQTT no connectat" };
}

export function registerHealthRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // GET /healthz — el procés viu i respon; no consulta la BD.
  typed.get(
    "/healthz",
    { schema: { tags: ["health"], summary: "Liveness: el procés respon" } },
    async (_request, reply) =>
      reply
        .header("Cache-Control", "no-store")
        .send({ status: "ok", uptime_s: Math.round(process.uptime()) }),
  );

  // GET /readyz — 200 només si la BD és oberta i l'esquema està al dia; 503 si no.
  typed.get(
    "/readyz",
    {
      schema: {
        tags: ["health"],
        summary: "Readiness: BD oberta, migracions aplicades i foreign_keys actiu",
      },
    },
    async (_request, reply) => {
      const checks = {
        database: databaseCheck(),
        migrations: migrationsCheck(),
        mqtt: mqttCheck(),
      };

      const ready = checks.database.status === "ok" && checks.migrations.status === "ok";

      return reply
        .header("Cache-Control", "no-store")
        .code(ready ? 200 : 503)
        .send({
          status: ready ? "ok" : "unavailable",
          checks,
          uptime_s: Math.round(process.uptime()),
        });
    },
  );
}
