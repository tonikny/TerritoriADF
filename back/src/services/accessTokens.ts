// Enllaços d'accés d'un sol ús: el coordinador no inventa contrasenyes, genera un
// enllaç i l'usuari hi tria la seva. A la BD només es desa el SHA-256 del token.
import { createHash, randomBytes } from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessTokens } from "../db/schema.js";

/** Un usuari nou té 7 dies per obrir l'enllaç; un restabliment, 24 h. */
export const ACCESS_TTL_NEW_USER_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_TTL_RESET_MS = 24 * 60 * 60 * 1000;

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export type IssuedAccessToken = { token: string; expires_at: string };

/**
 * Genera un token nou i invalida els pendents de l'usuari (un sol enllaç viu).
 * El token en clar només existeix aquí: després no es pot recuperar.
 */
export function issueAccessToken(userId: string, ttlMs: number): IssuedAccessToken {
  const token = randomBytes(32).toString("base64url");
  const expires_at = new Date(Date.now() + ttlMs).toISOString();

  db.delete(accessTokens).where(eq(accessTokens.user_id, userId)).run();
  db.insert(accessTokens)
    .values({ id: uuidv4(), user_id: userId, code_hash: sha256hex(token), expires_at })
    .run();

  return { token, expires_at };
}

/** Fila del token corresponent, o undefined si el token no existeix. */
export function findAccessToken(token: string) {
  return db
    .select()
    .from(accessTokens)
    .where(eq(accessTokens.code_hash, sha256hex(token)))
    .get();
}
