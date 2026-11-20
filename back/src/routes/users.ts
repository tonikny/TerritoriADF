import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { users, adfs, mqttUsers } from "../db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import type { ApiHandler, ApiRequest } from "../types.js";
import { BadRequestError } from "../errors.js";
import { hasPermission } from "../permissions.js";
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

/**
 * GET /api/users: abast global (`manage_all_users`) o només la pròpia ADF.
 * El permís `manage_users` i l'abast els declara `routes/index.ts`.
 */
export const list: ApiHandler = async (req, res) => {
  const user = req.user!;

  if (hasPermission(user.role, "manage_all_users")) {
    const rows = db.select(PUBLIC_FIELDS).from(users).orderBy(users.username).all();
    return res.json(rows);
  }

  // Un coordinador sense ADF no té res a llistar: és una dada inconsistents a la BD.
  if (user.adf_id === null) {
    return res.json([]);
  }

  const rows = db
    .select(PUBLIC_FIELDS)
    .from(users)
    .where(eq(users.adf_id, user.adf_id))
    .orderBy(users.username)
    .all();
  return res.json(rows);
};

/**
 * POST /api/users: crear usuari personal.
 * L'ADF del username i el rol `admin` ja s'han validat als guards de la ruta.
 */
export const create: ApiHandler = async (req, res) => {
  const { username, role } = req.body ?? {};

  if (!username || !role) {
    throw new BadRequestError("Falten camps: username, role");
  }
  if (!ROLES.includes(role)) {
    throw new BadRequestError(`Rol invàlid: ${role}`);
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
  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    throw new BadRequestError(`El nom d'usuari ${username} ja existeix`);
  }

  const id = randomUUID();
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

/**
 * PUT /api/users/:id: editar rol, contrasenya (reset) o username.
 * L'abast (ADF, administradors, un mateix) i el rol `admin` ja s'han validat als
 * guards de la ruta; aquí només queden les validacions de dades.
 */
export const update: ApiHandler = async (req, res) => {
  const targetId = req.params?.id;
  const { username, role } = req.body ?? {};

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
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

/**
 * DELETE /api/users/:id: eliminar usuari (mai a un mateix: ho comprova el guard).
 */
export const remove: ApiHandler = async (req, res) => {
  const targetId = req.params?.id;

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
  }

  // Els fills de l'usuari els resol la BD amb les accions ON DELETE de
  // l'esquema: `mqtt_users` i `access_tokens` cauen en cascada i
  // `incidencia_events.usuari_id` queda a NULL. Només cal llegir la identitat
  // MQTT abans d'esborrar per netejar-la també a DynSec.
  const mqttUsername = db.transaction((tx) => {
    const row = tx
      .select({ mqtt_username: mqttUsers.mqtt_username })
      .from(mqttUsers)
      .where(eq(mqttUsers.user_id, targetId))
      .get();
    tx.delete(users).where(eq(users.id, targetId)).run();
    return row?.mqtt_username;
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

/**
 * POST /api/users/:id/access-link: enllaç nou perquè l'usuari triï la seva contrasenya.
 * L'abast el declara el guard `requireTargetUserScope` a `routes/index.ts`.
 */
export const accessLink: ApiHandler = async (req, res) => {
  const targetId = req.params?.id;

  const target = db.select().from(users).where(eq(users.id, targetId)).get();
  if (!target) {
    throw new BadRequestError("Usuari no trobat");
  }

  return res.json({
    id: target.id,
    username: target.username,
    ...accessPayload(req, target.id, ACCESS_TTL_RESET_MS),
  });
};
