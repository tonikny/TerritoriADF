import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import sqlite, { db } from '../db/index.js';
import path from 'path';
import { logger } from '../utils/logger.js';
import { foreignKeyViolations } from '../db/pragmas.js';

const log = logger.child({ module: 'db', operation: 'migrate' });

async function runMigrations() {
  log.info('🔄 Executant migracions de la base de dades...');
  try {
    const migrationsFolder = path.resolve(import.meta.dirname, '../../drizzle');

    // Les migracions que canvien una acció ON DELETE reconstrueixen la taula
    // (SQLite no permet alterar una FK): CREATE + còpia + DROP + RENAME. Amb
    // `foreign_keys` actiu, el DROP d'una taula pare fa un DELETE implícit i
    // les cascades esborrarien files filles tot just copiades. El migrador de
    // Drizzle ho executa tot dins d'una transacció, on `PRAGMA foreign_keys`
    // no té cap efecte, així que el desactivem a la connexió i el tornem a
    // activar en acabar (procediment recomanat per SQLite).
    sqlite.pragma('foreign_keys = OFF');
    try {
      migrate(db, { migrationsFolder });
    } finally {
      sqlite.pragma('foreign_keys = ON');
    }
    log.info('✅ Migracions completades amb èxit.');

    // Activar el pragma no valida les files que ja hi eren: ho comprovem i ho
    // deixem al log. No fem fallar l'arrencada, perquè una BD amb òrfens
    // heretats ha de poder arrencar per netejar-los (`npm run db:check`).
    const violations = foreignKeyViolations(sqlite);
    if (violations.length > 0) {
      log.error(
        { count: violations.length, sample: violations.slice(0, 10) },
        '❌ Hi ha files amb claus foranes òrfenes: executa `npm run db:check`',
      );
    } else {
      log.info('✅ Integritat referencial correcta.');
    }
  } catch (error) {
    log.error({ error }, '❌ Error executant migracions');
    process.exitCode = 1;
  } finally {
    sqlite.close();
  }
}

await runMigrations();
