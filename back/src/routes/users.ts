import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db/index.js";
import { users, adfs, mqttUsers, incidencia_events, accessTokens } from "../db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import type { ApiHandler, ApiRequest } from "../types.js";
import { BadRequestError } from "../errors.js";
import { createMqttUser, deleteMqttUser, mqttNameFor } from "../services/mqtt.js";
import { decrypt } from "../utils/crypto.js";
import { appBaseUrl } from "../utils/appUrl.js";
import {
  ACCESS_TTL_NEW_USER_MS,
  ACCESS_TTL_RESET_MS,
  issueAccessToken,
} from "../services/accessTokens.js";

// Nom d'usuari: XXX/YYY o XXX/GI/YYY (XXX = id ADF, YYY = número dins l'ADF, 3 dígits).
const USERNAME_RE = /^(\d{3})\/(GI\/)?(\d{3})$/;
const ROLES = ["admin", "coordinador", "voluntari"] as const;

function parseUsername(username: string): { adfId: number } | null {
  const m = USERNAME_RE.exec(username);
  if (!m) {
    return null;
  }
  return { adfId: Number(m[1]) };
}

function adfExists(adfId: number): boolean {
  return !!db.select({ id: adfs.id }).from(adfs).where(eq(adfs.id, adfId)).get();
}

const PUBLIC_FIELDS = {
  id: users.id,
  username: users.username,
  adf_id: users.adf_id,
  role: users.role,
  created_at: users.created_at,
};

/**
 * Enllaç d'accés d'un sol ús. El token en clar només surt en aquesta resposta: a la BD
 * queda el hash, o sigui que si l'enllaç es perd cal generar-ne un de nou.
 */
function accessPayload(
  req: ApiRequest,
  userId: string,
  ttlMs: number,
): { access_url: string; access_expires_at: string } {
  const { token, expires_at } = issueAccessToken(userId, ttlMs);
  return { access_url: `${appBaseUrl(req)}/acces/${token}`, access_expires_at: expires_at };
}

/** GET /api/users: admin veu tots; coordinador els de la seva ADF. */
const list: ApiHandler = async (req, res) => {
  const user = req.user!;
  if (user.role === "admin") {
    const rows = db.select(PUBLIC_FIELDS).from(users).orderBy(users.username).all();
    return res.json(rows);
  }
  if (user.role === "coordinador" && user.adf_id !== null) {
    const rows = db
      .select(PUBLIC_FIELDS)
      .from(users)
      .where(eq(users.adf_id, user.adf_id))
      .orderBy(users.username)
      .all();
    return res.json(rows);
  }
  return res.status(403).json({ error: "No tens permisos per gestionar usuaris" });
};

/** POST /api/users: crear usuari personal. */
const create: ApiHandler = async (req, res) => {
  const caller = req.user!;
  const { username, role } = req.body ?? {};

  if (!username || !role) {
    throw new BadRequestError("Falten camps: username, role");
  }
  if (!ROLES.includes(role)) {
    throw new BadRequestError(`Rol invàlid: ${role}`);
  }
  if (role === "admin" && caller.role !== "admin") {
    return res.status(403).json({ error: "Només l'admin pot crear administradors" });
  }
  if (caller.role !== "admin" && caller.role !== "coordinador") {
    return res.status(403).json({ error: "No tens permisos per crear usuaris" });
  }

  const parsed = parseUsername(username);
  if (!parsed) {
    throw new BadRequestError(
      "El nom d'usuari ha de tenir el format XXX/YYY o XXX/GI/YYY (3 dígits cadascun)",
    );
  }
  if (!adfExists(parsed.adfId)) {
    throw new BadRequestError(`L'ADF ${parsed.adfId} no existeix`);
  }
  // El coordinador només pot crear usuaris de la seva pròpia ADF
  if (caller.role !== "admin" && caller.adf_id !== parsed.adfId) {
    return res.status(403).json({ error: "No tens permisos per crear usuaris d'aquesta ADF" });
  }
  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    throw new BadRequestError(`El nom d'usuari ${username} ja existeix`);
  }

  const id = uuidv4();
  // Contrasenya aleatòria que ningú no coneix: l'usuari entra per l'enllaç d'accés i hi
  // tria la seva, així el coordinador no arriba a saber mai la contrasenya de ningú.
  const hash = bcrypt.hashSync(randomBytes(32).toString("hex"), 10);
  db.insert(users).values({ id, username, password_hash: hash, adf_id: parsed.adfId, role }).run();

  const row = db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, id)).get();
  return res.status(201).json({ ...row, ...accessPayload(req, id, ACCESS_TTL_NEW_USER_MS) });
};

/** Manté la identitat MQTT (client DynSec + mqtt_users) alineada amb el nom d'usuari
 *  quan es re-num amb el username d'un usuari amb OwnTracks activat. */
async function propagateMqttRename(userId: string, newUsername: string): Promise<void> {
  const row = db.select().from(mqttUsers).where(eq(mqttUsers.user_id, userId)).get();
  const newMqName = mqttNameFor(newUsername);
  if (!row || row.mqtt_username === newMqName) {
    return;
  }
  const oldUsername = row.mqtt_username;
  if (oldUsername && row.mqtt_password_enc) {
    const password = decrypt(row.mqtt_password_enc);
    if (password) {
      try {
        await createMqttUser(newMqName, password);
      } catch {
        /* MQTT no disponible; es re-cread a la propera baixada de config */
      }
      try {
        await deleteMqttUser(oldUsername);
      } catch {
        /* client antic podria no existir a DynSec */
      }
    }
  }
  db.update(mqttUsers).set({ mqtt_username: newMqName }).where(eq(mqttUsers.id, row.id)).run();
}

/** PUT /api/users/:id: editar rol, contrasenya (reset) o username. */
const update: ApiHandler = async (req, res) => {
  const caller = req.user!;
  const targetId = req.params?.id;
  const { username, role } = req.body ?? {};

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
  }

  // Abast: admin qualsevol; coordinador només la seva ADF
  if (caller.role !== "admin") {
    if (caller.role !== "coordinador" || caller.adf_id !== target.adf_id) {
      return res.status(403).json({ error: "No tens permisos per editar aquest usuari" });
    }
    if (target.id === caller.id) {
      return res.status(403).json({ error: "No et pots editar a tu mateix" });
    }
  }

  const updates: Record<string, unknown> = {};

  if (username !== undefined) {
    const parsed = parseUsername(username);
    if (!parsed) {
      throw new BadRequestError("El nom d'usuari ha de tenir el format XXX/YYY o XXX/GI/YYY");
    }
    if (!adfExists(parsed.adfId)) {
      throw new BadRequestError(`L'ADF ${parsed.adfId} no existeix`);
    }
    if (caller.role !== "admin" && parsed.adfId !== caller.adf_id) {
      return res.status(403).json({ error: "No pots moure l'usuari a una altra ADF" });
    }
    const dup = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, targetId)))
      .get();
    if (dup) {
      throw new BadRequestError(`El nom d'usuari ${username} ja existeix`);
    }
    updates.username = username;
    updates.adf_id = parsed.adfId;
  }

  if (role !== undefined) {
    if (!ROLES.includes(role)) {
      throw new BadRequestError(`Rol invàlid: ${role}`);
    }
    if (role === "admin" && caller.role !== "admin") {
      return res.status(403).json({ error: "Només l'admin pot assignar el rol admin" });
    }
    if (caller.role !== "admin" && target.role === "admin") {
      return res.status(403).json({ error: "No pots modificar un administrador" });
    }
    updates.role = role;
  }

  if (Object.keys(updates).length > 0) {
    db.update(users).set(updates).where(eq(users.id, targetId)).run();
  }
  if (username !== undefined && username !== target.username) {
    await propagateMqttRename(targetId, username);
  }
  const row = db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, targetId)).get();
  return res.json(row);
};

/** DELETE /api/users/:id: eliminar usuari (mai a un mateix). */
const remove: ApiHandler = async (req, res) => {
  const caller = req.user!;
  const targetId = req.params?.id;

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
  }
  if (target.id === caller.id) {
    return res.status(403).json({ error: "No et pots eliminar a tu mateix" });
  }
  if (caller.role !== "admin") {
    if (caller.role !== "coordinador" || caller.adf_id !== target.adf_id) {
      return res.status(403).json({ error: "No tens permisos per eliminar aquest usuari" });
    }
  }
  let mqttUsername: string | undefined;
  db.transaction((tx) => {
    const mqttRow = tx
      .select({ mqtt_username: mqttUsers.mqtt_username })
      .from(mqttUsers)
      .where(eq(mqttUsers.user_id, targetId))
      .get();
    if (mqttRow) {
      mqttUsername = mqttRow.mqtt_username;
    }
    tx.delete(accessTokens).where(eq(accessTokens.user_id, targetId)).run();
    tx.delete(mqttUsers).where(eq(mqttUsers.user_id, targetId)).run();
    tx.update(incidencia_events)
      .set({ usuari_id: null })
      .where(eq(incidencia_events.usuari_id, targetId))
      .run();
    tx.delete(users).where(eq(users.id, targetId)).run();
  });
  if (mqttUsername) {
    try {
      await deleteMqttUser(mqttUsername);
    } catch {
      /* MQTT pot no estar disponible; la neteja DB ja està feta */
    }
  }
  return res.json({ success: true });
};

/** POST /api/users/:id/access-link: enllaç nou perquè l'usuari triï la seva contrasenya. */
export const accessLink: ApiHandler = async (req, res) => {
  const caller = req.user!;
  const targetId = req.params?.id;

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
  }
  if (
    caller.role !== "admin" &&
    (caller.role !== "coordinador" || caller.adf_id !== target.adf_id)
  ) {
    return res.status(403).json({ error: "No tens permisos per generar enllaços d'aquest usuari" });
  }

  return res.json({
    id: target.id,
    username: target.username,
    ...accessPayload(req, target.id, ACCESS_TTL_RESET_MS),
  });
};

const handler: ApiHandler = async (req, res) => {
  if (req.params?.id) {
    if (req.method === "PUT") {
      return update(req, res);
    }
    if (req.method === "DELETE") {
      return remove(req, res);
    }
  }
  if (req.method === "GET") {
    return list(req, res);
  }
  if (req.method === "POST") {
    return create(req, res);
  }
  res.status(405).json({ error: "Method not allowed" });
};

export default handler;
export { list, create, update, remove };
