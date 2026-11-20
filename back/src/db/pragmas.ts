import type BetterSqlite3 from "better-sqlite3";

/**
 * Pragmas que cal aplicar a **cada** connexió que s'obre amb SQLite.
 *
 * `journal_mode` es desa al fitxer, però `foreign_keys` no: SQLite el desactiva
 * per defecte a cada connexió. Les `.references()` de Drizzle només són
 * metadades per generar migracions, no una garantia d'execució, així que sense
 * aquest pragma es poden inserir hidrants d'una ADF inexistent, incidències
 * òrfenes o enllaços de Telegram penjant.
 *
 * `busy_timeout` evita els `SQLITE_BUSY` immediats quan el backup o una altra
 * connexió té el fitxer bloquejat, i `synchronous = NORMAL` és el mode
 * recomanat amb WAL: no es corromp la BD, només es poden perdre les últimes
 * transaccions si cau el sistema operatiu.
 */
export function applyPragmas(sqlite: BetterSqlite3.Database): void {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  // Comprovem que el pragma ha quedat actiu: si algú l'executa dins d'una
  // transacció, SQLite l'ignora en silenci i l'aplicació creuria que valida.
  if (sqlite.pragma("foreign_keys", { simple: true }) !== 1) {
    throw new Error("PRAGMA foreign_keys no s'ha pogut activar en aquesta connexió");
  }
}

export interface ForeignKeyViolation {
  /** Taula filla on és la fila òrfena. */
  table: string;
  /** rowid de la fila òrfena (null si la taula és WITHOUT ROWID). */
  rowid: number | null;
  /** Taula pare que no existeix. */
  parent: string;
  /** Índex de la restricció dins de la taula filla. */
  fkid: number;
}

/**
 * `PRAGMA foreign_key_check` sobre tota la BD. Retorna una entrada per cada
 * fila que referencia una clau forana inexistent. No llança error: activar
 * `foreign_keys` no valida les dades que ja hi són, així que cal cridar-ho
 * explícitament (a la migració i a `npm run db:check`).
 */
export function foreignKeyViolations(sqlite: BetterSqlite3.Database): ForeignKeyViolation[] {
  return sqlite.pragma("foreign_key_check") as ForeignKeyViolation[];
}
