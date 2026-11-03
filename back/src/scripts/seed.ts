import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, adfs } from '../db/schema.js';
import { logger } from '../utils/logger.js';

const log = logger.child({module: 'db', operation: 'seed'});

// Catàleg d'ADFs basat en la llista anterior de municipis
// En aquest cas, cada municipi té la seva pròpia ADF per defecte
const ADFS_INICIALS = [
  { id: 278, nom: 'ADF els Hostalets de Pierola', relations: ['R345695'] },
  { id: 266, nom: 'ADF Piera', relations: ['R345699'] },
  { id: 256, nom: 'ADF Masquefa', relations: ['R340791'] },
  { id: 279, nom: "ADF Vallbona d'Anoia", relations: ['R341896'] },
  { id: 202, nom: 'ADF la Torre de Claramunt', relations: ['R343659'] },
];

// Format de nom d'usuari vàlid per a usuaris no-admin: XXX/YYY o XXX/GI/YYY (XXX = id ADF, YYY = 3 dígits)
const USERNAME_RE = /^(\d{3})\/(GI\/)?\d{3}$/;

// Usuaris d'inici per ADF. TOTS han de complir el format de nom vàlid.
const USERS_INICIALS: { username: string; role: 'coordinador' | 'voluntari' }[] = [
  { username: '278/001', role: 'coordinador' },
  { username: '278/GI/001', role: 'voluntari' },
  { username: '266/001', role: 'coordinador' },
  { username: '266/GI/001', role: 'voluntari' },
  { username: '256/001', role: 'coordinador' },
  { username: '279/001', role: 'coordinador' },
  { username: '202/001', role: 'coordinador' },
];

async function run() {
  log.info('🌱 Iniciant seed de dades (ADF i Usuaris)...');

  // Contrasenya inicial aleatòria (no fixa al codi): es mostra un sol cop al log i només
  // s'aplica als usuaris que es creen ara. Després del primer accés, canvia-la.
  // Si ja existeixen, `onConflictDoNothing` conserva la contrasenya actual.
  const initialPassword = randomBytes(9).toString('base64url');
  const hash = bcrypt.hashSync(initialPassword, 10);

  try {
    // 1. Inserir ADFs
    for (const adfData of ADFS_INICIALS) {
      db.insert(adfs)
        .values({
          id: adfData.id,
          nom: adfData.nom,
          osm_relations: JSON.stringify(adfData.relations),
        })
        .onConflictDoNothing()
        .run();
      log.info({ adf_id: adfData.id, adf_nom: adfData.nom }, '✅ ADF creada');
    }

    // 2. Admin global (únic usuari fora de la nomenclatura per ADF)
    db.insert(users)
      .values({
        id: uuidv4(),
        username: 'admin',
        password_hash: hash,
        adf_id: null, // Admin global
        role: 'admin',
      })
      .onConflictDoNothing()
      .run();
    log.info('👤 Usuari admin global creat (admin)');
    log.warn(
      { initial_password: initialPassword },
      '🔑 Contrasenya inicial dels usuaris nous del seed (canvia-la després del primer accés)',
    );

    // 3. Usuaris operatius definits a USERS_INICIALS (valida format i es deriva l'ADF del prefix)
    for (const u of USERS_INICIALS) {
      if (!USERNAME_RE.test(u.username)) {
        throw new Error(`Nom d'usuari invàlid per al seed: ${u.username}`);
      }
      const adfId = Number(u.username.slice(0, 3));
      const adf = db.select({ id: adfs.id, nom: adfs.nom }).from(adfs).where(eq(adfs.id, adfId)).get();
      if (!adf) {
        throw new Error(`L'ADF ${adfId} del usuari ${u.username} no existeix a la base de dades`);
      }
      db.insert(users)
        .values({
          id: uuidv4(),
          username: u.username,
          password_hash: hash,
          adf_id: adfId,
          role: u.role,
        })
        .onConflictDoNothing()
        .run();
      log.info({ username: u.username, role: u.role, adf_nom: adf.nom }, '👤 Usuari creat');
    }

    log.info('✨ Seed completat correctament.');
  } catch (error) {
    log.error({ error }, '❌ Error durant el seed');
    process.exit(1);
  }
}

await run();