import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { users, mqttUsers, adfs } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { ApiHandler } from "../types.js";
import { permissionsFor } from "../permissions.js";
import { passwordProblem } from "../utils/password.js";
import { loginBlock, registerLoginFailure, resetLoginFailures } from "../services/loginThrottle.js";

/**
 * Usuari exposat al client. Mateix shape per a /login i /me: els permisos es deriven
 * del rol aquí (única font de veritat: back/src/permissions.ts), mai no vénen de la BD.
 */
export function toPublicUser(user: {
  id: string;
  username: string;
  adf_id: number | null;
  role: string | null;
}) {
  // El rol a BD és nullable (default "voluntari"); normalitzem per no exposar null ni
  // signar un token amb un rol diferent del de la resposta.
  const role = user.role ?? "voluntari";

  const mqttRow = db
    .select()
    .from(mqttUsers)
    .where(and(eq(mqttUsers.user_id, user.id), eq(mqttUsers.enabled, true)))
    .get();

  return {
    id: user.id,
    username: user.username,
    adf_id: user.adf_id,
    role,
    mqtt_enabled: !!mqttRow,
    permissions: permissionsFor(role),
  };
}

/**
 * Hash sintètic per igualar el cost de bcrypt quan l'usuari no existeix.
 * Evita enumeració d'usuaris per timing: sempre es fa una comparació bcrypt.
 * Es genera un cop a l'arrencada (cost ~100 ms, no per petició).
 */
const DUMMY_HASH = bcrypt.hashSync("login-timing-mitigation-synthetic-password", 10);

/**
 * Login handler
 * POST /api/auth/login
 * Body: { username, password }
 */
export const login: ApiHandler = async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    return res.status(400).json({ error: "Falten credencials" });
  }

  // Fre de força bruta: es mira abans de tocar bcrypt per no gastar CPU amb atacs.
  const blocked = loginBlock(username, req.ip);
  if (blocked) {
    req.log
      .child({ module: "auth", operation: "login" })
      .warn({ username }, "Login bloquejat per massa intents");
    res.setHeader("Retry-After", String(blocked.retryAfterSeconds));
    return res.status(429).json({ error: blocked.error });
  }

  try {
    const user = db.select().from(users).where(eq(users.username, username)).get();

    // Sempre es compara amb bcrypt (hash real o sintètic) perquè un usuari
    // inexistent no respongui mesurablement més ràpid (enumeració per timing).
    const hash = user?.password_hash ?? DUMMY_HASH;
    const ok = bcrypt.compareSync(password, hash);

    if (!user || !ok) {
      registerLoginFailure(username, req.ip);
      return res.status(401).json({ error: "Usuari o contrasenya incorrectes" });
    }

    resetLoginFailures(username, req.ip);

    const publicUser = toPublicUser(user);

    res._userToSign = {
      id: publicUser.id,
      username: publicUser.username,
      adf_id: publicUser.adf_id,
      role: publicUser.role,
      tv: user.token_version ?? 0,
    };

    return res.status(200).json({ user: publicUser });
  } catch (err) {
    req.log.child({ module: "auth", operation: "login" }).error({ err, username }, "Login error");
    res.status(500).json({ error: "Error intern del servidor" });
  }
};

/**
 * Logout handler
 * POST /api/auth/logout
 */
export const logout: ApiHandler = async (req, res) => {
  res._clearCookie = true;
  return res.status(200).json({ success: true });
};

/**
 * Canvi de la pròpia contrasenya
 * PUT /api/auth/password
 * Body: { currentPassword, newPassword }
 */
export const changePassword: ApiHandler = async (req, res) => {
  const userId = req.user!.id;
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Cal indicar la contrasenya actual i la nova" });
  }
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: "La contrasenya actual no és correcta" });
  }

  const adfNom = user.adf_id
    ? (db.select({ nom: adfs.nom }).from(adfs).where(eq(adfs.id, user.adf_id)).get()?.nom ?? null)
    : null;

  const problem = passwordProblem(newPassword, "La contrasenya nova", {
    username: user.username,
    adfNom,
  });
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  // Invalida totes les altres sessions (inclosa una cookie robada): la sessió
  // actual se resigna amb la nova versió perquè l'usuari no perdi l'accés.
  const newVersion = (user.token_version ?? 0) + 1;
  const hash = bcrypt.hashSync(newPassword, 10);
  db.update(users)
    .set({ password_hash: hash, token_version: newVersion })
    .where(eq(users.id, userId))
    .run();

  res._userToSign = {
    id: user.id,
    username: user.username,
    adf_id: user.adf_id,
    role: user.role ?? "voluntari",
    tv: newVersion,
  };

  req.log
    .child({ module: "auth", operation: "changePassword" })
    .info({ username: user.username }, "Contrasenya actualitzada");

  return res.json({ success: true });
};

/**
 * Get current user
 * GET /api/auth/me
 */
export const me: ApiHandler = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "No autenticat" });
  }

  return res.json({ user: toPublicUser(req.user) });
};
