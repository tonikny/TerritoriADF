import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { logger } from "../utils/logger.js";
import { applyPragmas } from "./pragmas.js";

// El volum a Docker està a /app/data, que a local és back/data
const DATA_DIR = path.resolve(import.meta.dirname, "../../data");
const DB_FILENAME = "territoriadf.db";
const LEGACY_DB_FILENAME = "hidrants.db";
// `DB_PATH` permet apuntar la connexió a una altra BD (la suite de tests hi
// posa una BD temporal). Sense la variable s'usa el fitxer de sempre.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(DATA_DIR, DB_FILENAME);
const LEGACY_DB_PATH = path.join(DATA_DIR, LEGACY_DB_FILENAME);
const USING_DEFAULT_DB = !process.env.DB_PATH;

// Assegurem que el directori de dades existeix
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Amb WAL la BD viu en tres fitxers, que s'han de moure junts: si el journal es
// queda enrere, el fitxer renombrat apareix sense les últimes transaccions.
const DB_FILE_SUFFIXES = ["", "-wal", "-shm"];

/**
 * Renombra la BD de la fase anterior (`hidrants.db`) al nom actual.
 *
 * S'executa a l'arrencada, abans d'obrir la connexió, així que val igual per a
 * un `npm run dev` local i per al contenidor del servidor: el primer backend que
 * arrenqui després del desplegament migra el fitxer i no cal cap pas manual. Si
 * ja existeix la BD nova no es toca res; si hi ha les dues, mana la nova i la
 * vella es conserva perquè qui administra la pugui revisar.
 */
function migrateLegacyDatabase(): void {
  if (!fs.existsSync(LEGACY_DB_PATH)) {
    return;
  }

  if (fs.existsSync(DB_PATH)) {
    logger.warn(
      { legacy: LEGACY_DB_PATH, current: DB_PATH },
      "Hi ha la BD antiga i la nova: es fa servir la nova i la vella no es toca",
    );
    return;
  }

  for (const suffix of DB_FILE_SUFFIXES) {
    const from = `${LEGACY_DB_PATH}${suffix}`;
    if (fs.existsSync(from)) {
      fs.renameSync(from, `${DB_PATH}${suffix}`);
    }
  }

  logger.info({ from: LEGACY_DB_FILENAME, to: DB_FILENAME }, "BD renombrada al nom actual");
}

// El renombratge només té sentit per a la BD per defecte: si `DB_PATH` apunta a
// un fitxer extern (tests), no s'ha de tocar el directori de dades del projecte.
if (USING_DEFAULT_DB) {
  migrateLegacyDatabase();
}

const sqlite = new Database(DB_PATH);

// WAL, foreign_keys, busy_timeout i synchronous. `foreign_keys` és per connexió
// i ve desactivat per defecte: sense ell les `.references()` de Drizzle són pur
// decorat i es poden crear files òrfenes. Les files òrfenes heretades les
// reporta la migració (`migrate.ts`) i les detalla `npm run db:check`.
applyPragmas(sqlite);

// Exportem la instància de Drizzle
export const db = drizzle(sqlite, { schema });

/**
 * Executa diverses operacions de repositori com una sola transacció. Els
 * serveis que han de fer un conjunt d'escriptures atòmic (p. ex. el pull
 * d'OSM) la fan servir sense importar `db` ni l'esquema.
 */
export function inTransaction<T>(fn: () => T): T {
  return db.transaction(() => fn());
}

// Exportem la instància de sqlite (per si cal accés directe mentre migrem)
export default sqlite;
