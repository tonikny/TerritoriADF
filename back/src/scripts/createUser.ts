import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { users, adfs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { passwordProblem } from '../utils/password.js';

const log = logger.child({ module: 'auth', operation: 'create_user' });

const username = process.argv[2];
const password = process.argv[3];
const role = (process.argv[4] || 'admin') as 'admin' | 'coordinador' | 'voluntari';
const adfIdArg = process.argv[5] ? Number(process.argv[5]) : null;

const ROLES = ['admin', 'coordinador', 'voluntari'];
const USERNAME_RE = /^(\d{3})\/(GI\/)?(\d{3})$/;

if (!username || !password) {
  log.error('Ús: npm run create:user <usuari> <contrasenya> [rol] [adf_id]');
  log.error('Roles: admin, coordinador, voluntari (default admin)');
  log.error('Usuari no-admin: format XXX/YYY o XXX/GI/YYY (3 dígits, XXX = id ADF)');
  process.exit(1);
}

if (!ROLES.includes(role)) {
  log.error({ role, validRoles: ROLES }, '❌ Rol invàlid');
  process.exit(1);
}

// Deriva l'ADF del nom d'usuari quan aplica
let adf_id: number | null = null;
const m = USERNAME_RE.exec(username);
if (role !== 'admin') {
  if (!m) {
    log.error('❌ El nom d\'usuari no-admin ha de tenir format XXX/YYY o XXX/GI/YYY');
    process.exit(1);
  }
  adf_id = Number(m[1]);
}
if (m) {
  adf_id = Number(m[1]);
} else if (adfIdArg !== null) {
  adf_id = adfIdArg;
}

let adfNom: string | null = null;
if (adf_id !== null) {
  const adf = db
    .select({ id: adfs.id, nom: adfs.nom })
    .from(adfs)
    .where(eq(adfs.id, adf_id))
    .get();
  if (!adf) {
    log.error({ adf_id }, '❌ ADF no existeix a la base de dades');
    process.exit(1);
  }
  adfNom = adf.nom;
}

// La contrasenya es valida quan ja se sap l'usuari i l'ADF (per no acceptar-ne el nom).
const problem = passwordProblem(password, 'La contrasenya', { username, adfNom });
if (problem) {
  log.error(problem);
  process.exit(1);
}

const id = uuidv4();
const hash = bcrypt.hashSync(password, 10);

try {
  db.insert(users).values({ id, username, password_hash: hash, adf_id, role }).run();
  log.info({ username, role, adf_id }, '✅ Usuari creat');
} catch (err) {
  log.error({ err: (err as Error).message }, '❌ Error creant usuari');
}