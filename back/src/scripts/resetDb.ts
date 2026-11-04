import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import fs from 'fs';
import path from 'path';
import sqlite, { db } from '../db/index.js';
import { logger } from '../utils/logger.js';
import {
  hidrants,
  users,
  adfs,
  mqttUsers,
  incidencies,
  incidencia_events,
} from '../db/schema.js';

const log = logger.child({ module: 'db', operation: 'reset' });

async function makeBackup() {
  const backupsDir = path.resolve(import.meta.dirname, '../../data/backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsDir, `territoriadf-${stamp}.db`);
  await sqlite.backup(dest);
  return dest;
}

async function run() {
  log.info('🗑️ Buidant la base de dades...');

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    '⚠️  Això esborrarà TOTES les dades (hidrants, usuaris, ADFs, incidències). Escriu "RESET" per confirmar: '
  );
  rl.close();

  if (answer.trim() !== 'RESET') {
    log.warn('❌ Cancel·lat. Res no s\'ha modificat.');
    process.exit(1);
  }

  try {
    const backupPath = await makeBackup();
    log.info({ backupPath }, '💾 Còpia de seguretat creada');
    db.delete(incidencia_events).run();
    log.info('✅ Taula "incidencia_events" buidada.');

    db.delete(mqttUsers).run();
    log.info('✅ Taula "mqtt_users" buidada.');

    db.delete(incidencies).run();
    log.info('✅ Taula "incidencies" buidada.');

    db.delete(hidrants).run();
    log.info('✅ Taula "hidrants" buidada.');

    db.delete(users).run();
    log.info('✅ Taula "users" buidada.');

    db.delete(adfs).run();
    log.info('✅ Taula "adfs" buidada.');

    log.info('✨ Base de dades buidada correctament.');
  } catch (error) {
    log.error({ error }, '❌ Error buient la base de dades');
    process.exit(1);
  }
}

await run();
