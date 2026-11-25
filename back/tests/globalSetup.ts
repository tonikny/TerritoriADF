import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { TEST_DB_PATH } from "./env.js";

/** Amb WAL la BD viu en tres fitxers; s'han d'esborrar junts. */
const DB_SUFFIXES = ["", "-wal", "-shm"];

/**
 * Pany per a una BD compartida explícitament (`TEST_DB_PATH`): per defecte cada
 * execució té el seu fitxer, però si dues apunten al mateix, una migraria o
 * esborraria la BD mentre l'altra hi treballa. El fitxer conté el PID.
 */
const LOCK_PATH = `${TEST_DB_PATH}.lock`;
let releaseLock: (() => void) | null = null;

function removeDatabaseFiles(): void {
  for (const suffix of DB_SUFFIXES) {
    fs.rmSync(`${TEST_DB_PATH}${suffix}`, { force: true });
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Crea el pany o falla amb un missatge accionable. Un pany d'un procés que ja
 * no existeix (execució interrompuda) es considera orfe i es reclama.
 */
function acquireLock(): () => void {
  try {
    fs.writeFileSync(LOCK_PATH, String(process.pid), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
    const owner = Number.parseInt(fs.readFileSync(LOCK_PATH, "utf8"), 10);
    // Un fitxer sense PID vàlid pot ser una escriptura a mitges d'una altra
    // execució: el tractem com a ocupat en lloc de reclamar-lo i arriscar-nos
    // que les dues suites comparteixin la BD.
    if (!Number.isInteger(owner) || owner <= 0 || isProcessAlive(owner)) {
      const who =
        Number.isInteger(owner) && owner > 0 ? `PID ${owner}` : "un propietari desconegut";
      throw new Error(
        `Una altra execució de Vitest (${who}) ja fa servir la BD de test ` +
          `(${TEST_DB_PATH}). Espera que acabi o elimina ${LOCK_PATH} si el procés ja no existeix.`,
        { cause: err },
      );
    }
    fs.rmSync(LOCK_PATH, { force: true });
    return acquireLock();
  }

  return () => fs.rmSync(LOCK_PATH, { force: true });
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
  releaseLock = acquireLock();
  try {
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
  } catch (err) {
    releaseLock();
    releaseLock = null;
    throw err;
  }
}

export async function teardown(): Promise<void> {
  // Si aquest procés no va aconseguir el pany, la BD és d'una altra execució:
  // no l'hem d'esborrar. Vitest pot cridar `teardown` encara que `setup` falli.
  if (!releaseLock) {
    return;
  }
  removeDatabaseFiles();
  releaseLock();
  releaseLock = null;
}
