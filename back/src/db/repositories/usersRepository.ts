import { and, eq, ne } from "drizzle-orm";
import { db } from "../index.js";
import { mqttUsers, users } from "../schema.js";

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type UserUpdate = Partial<Omit<UserInsert, "id">>;

/** Camps que es poden exposar per l'API de gestió d'usuaris. */
const PUBLIC_FIELDS = {
  id: users.id,
  username: users.username,
  adf_id: users.adf_id,
  role: users.role,
  created_at: users.created_at,
};

export type PublicUserRow = {
  id: string;
  username: string;
  adf_id: number | null;
  role: UserRow["role"];
  created_at: string | null;
};

/**
 * Accés a la taula `users`. Inclou la lectura de l'usuari de sessió que fa
 * `plugins/auth.ts` i l'esborrat atòmic que llegeix abans la identitat MQTT.
 */
export const UsersRepository = {
  findById(id: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  },

  findByUsername(username: string): UserRow | undefined {
    return db.select().from(users).where(eq(users.username, username)).get();
  },

  findPublicById(id: string): PublicUserRow | undefined {
    return db.select(PUBLIC_FIELDS).from(users).where(eq(users.id, id)).get() as
      PublicUserRow | undefined;
  },

  findAllPublic(): PublicUserRow[] {
    return db.select(PUBLIC_FIELDS).from(users).orderBy(users.username).all() as PublicUserRow[];
  },

  findPublicByAdf(adfId: number): PublicUserRow[] {
    return db
      .select(PUBLIC_FIELDS)
      .from(users)
      .where(eq(users.adf_id, adfId))
      .orderBy(users.username)
      .all() as PublicUserRow[];
  },

  /** Nom + ADF de tots els usuaris: el filtre de visibilitat del tracking. */
  findMemberships(): Array<{ username: string; adf_id: number | null }> {
    return db.select({ username: users.username, adf_id: users.adf_id }).from(users).all();
  },

  /** ID, ADF i rol d'un usuari objectiu (guards d'abast). */
  findScopeById(id: string): Pick<UserRow, "id" | "adf_id" | "role"> | undefined {
    return db
      .select({ id: users.id, adf_id: users.adf_id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .get();
  },

  usernameExists(username: string): boolean {
    return !!db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  },

  usernameTakenByOther(username: string, id: string): boolean {
    return !!db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, id)))
      .get();
  },

  create(data: UserInsert): void {
    db.insert(users).values(data).run();
  },

  update(id: string, data: UserUpdate): void {
    if (Object.keys(data).length === 0) {
      return;
    }
    db.update(users).set(data).where(eq(users.id, id)).run();
  },

  updatePassword(id: string, passwordHash: string, tokenVersion: number): void {
    db.update(users)
      .set({ password_hash: passwordHash, token_version: tokenVersion })
      .where(eq(users.id, id))
      .run();
  },

  /**
   * Esborra l'usuari i retorna la seva identitat MQTT. Les dues operacions van
   * en una transacció perquè DynSec es pugui netejar tot i que la fila cau en
   * cascada.
   */
  deleteReturningMqttUsername(id: string): string | undefined {
    return db.transaction((tx) => {
      const row = tx
        .select({ mqtt_username: mqttUsers.mqtt_username })
        .from(mqttUsers)
        .where(eq(mqttUsers.user_id, id))
        .get();
      tx.delete(users).where(eq(users.id, id)).run();
      return row?.mqtt_username;
    });
  },
};
