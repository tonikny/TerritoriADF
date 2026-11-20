import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { TEST_DB_PATH } from "./env.js";

/** Amb WAL la BD viu en tres fitxers; s'han d'esborrar junts. */
const DB_SUFFIXES = ["", "-wal", "-shm"];

function removeDatabaseFiles(): void {
  for (const suffix of DB_SUFFIXES) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
}

/**
 * Crea la BD temporal i hi aplica **totes** les migracions de `drizzle/` abans
 * que cap test importi `src/db/index.ts`.
 *
 * Les migracions que reconstrueixen taules necessiten `foreign_keys = OFF`
 * (mateix motiu que `src/scripts/migrate.ts`): amb el pragma actiu, el DROP
 * d'una taula pare pot esborrar en cascada les files filles acabades de copiar.
 */
export async function setup(): Promise<void> {
  removeDatabaseFiles();

  const sqlite = new Database(TEST_DB_PATH);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("foreign_keys = OFF");
    migrate(drizzle(sqlite), {
      migrationsFolder: path.resolve(import.meta.dirname, "../drizzle"),
    });
  } finally {
    sqlite.close();
  }
}

export async function teardown(): Promise<void> {
  removeDatabaseFiles();
}
