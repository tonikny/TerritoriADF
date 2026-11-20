import { randomUUID } from "node:crypto";
import sqlite from "../db/index.js";
import { foreignKeyViolations } from "../db/pragmas.js";
import { logger } from "../utils/logger.js";

/**
 * Comprovació d'integritat referencial.
 *
 * 1. Dins d'una transacció que sempre es desfà, prova el DDL real de la BD:
 *    que `foreign_keys` rebutja una clau forana inexistent i que les accions
 *    ON DELETE de l'esquema (cascade / set null) s'apliquen en esborrar.
 * 2. `PRAGMA foreign_key_check` llista les files que referencien un pare
 *    inexistent (herència d'abans d'activar el pragma). No esborra res: la
 *    neteja és una decisió de qui administra.
 *
 * Requereix les migracions aplicades (`npm run db:migrate`). Surt amb codi 1 si
 * alguna comprovació falla, així que serveix de porta a CI i a pre-desplegament.
 */

const log = logger.child({ module: "db", operation: "check" });

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = ""): void => {
  checks.push({ name, ok, detail });
};

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }
  return "cap error";
}

if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'hidrants'").get()) {
  log.error("La BD no té l'esquema aplicat: executa `npm run db:migrate` abans de `db:check`");
  sqlite.close();
  process.exit(1);
}

// Tot el que escriu va dins la transacció: si `foreign_keys` estigués
// desactivat, la inserció òrfena passaria, però el ROLLBACK la desfà igualment.
sqlite.exec("BEGIN");
try {
  const orphanInsert = (() => {
    try {
      sqlite
        .prepare("INSERT INTO hidrants (id, adf_id, lat, lon) VALUES (?, 999999, 41.6, 1.5)")
        .run(`check-${randomUUID()}`);
      return "inserció acceptada";
    } catch (error) {
      return errorCode(error);
    }
  })();
  check("FK inexistent rebutjada", orphanInsert === "SQLITE_CONSTRAINT_FOREIGNKEY", orphanInsert);

  const userId = randomUUID();
  const incidenciaId = randomUUID();
  sqlite
    .prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, 'x')")
    .run(userId, `check-${userId}`);
  sqlite
    .prepare("INSERT INTO mqtt_users (id, user_id, mqtt_username) VALUES (?, ?, ?)")
    .run(randomUUID(), userId, `check-${userId}`);
  sqlite
    .prepare("INSERT INTO incidencies (id, titol, tipus, lat, lon) VALUES (?, 'check', 'check', 41.6, 1.5)")
    .run(incidenciaId);
  sqlite
    .prepare(
      "INSERT INTO incidencia_events (id, incidencia_id, usuari_id, tipus_event) VALUES (?, ?, ?, 'check')",
    )
    .run(randomUUID(), incidenciaId, userId);

  sqlite.prepare("DELETE FROM users WHERE id = ?").run(userId);

  const mqtt = sqlite
    .prepare("SELECT count(*) AS c FROM mqtt_users WHERE user_id = ?")
    .get(userId) as { c: number };
  check("ON DELETE CASCADE esborra els fills", mqtt.c === 0, `${mqtt.c} files a mqtt_users`);

  const event = sqlite
    .prepare("SELECT usuari_id FROM incidencia_events WHERE incidencia_id = ?")
    .get(incidenciaId) as { usuari_id: string | null };
  check("ON DELETE SET NULL conserva l'historial", event.usuari_id === null, `usuari_id = ${String(event.usuari_id)}`);
} finally {
  sqlite.exec("ROLLBACK");
}

const pragma = sqlite.pragma("foreign_keys", { simple: true });
check("PRAGMA foreign_keys actiu", pragma === 1, `foreign_keys = ${String(pragma)}`);

const violations = foreignKeyViolations(sqlite);
const perTable = new Map<string, number>();
for (const v of violations) {
  const key = `${v.table} → ${v.parent}`;
  perTable.set(key, (perTable.get(key) ?? 0) + 1);
}
check(
  "Cap fila òrfena",
  violations.length === 0,
  violations.length === 0
    ? "foreign_key_check net"
    : [...perTable].map(([key, count]) => `${key}: ${count}`).join(", "),
);

let failed = 0;
for (const result of checks) {
  if (result.ok) {
    log.info({ detail: result.detail }, `✅ ${result.name}`);
  } else {
    failed++;
    log.error({ detail: result.detail }, `❌ ${result.name}`);
  }
}

sqlite.close();
log.info(
  { checks: checks.length, failed },
  failed === 0 ? "✅ Integritat referencial OK" : "❌ Revisa les comprovacions fallides",
);
process.exitCode = failed === 0 ? 0 : 1;
