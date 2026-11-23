import { eq } from "drizzle-orm";
import { db } from "../index.js";
import { accessTokens, users } from "../schema.js";

export type AccessTokenRow = typeof accessTokens.$inferSelect;
export type AccessTokenInsert = typeof accessTokens.$inferInsert;

/**
 * Enllaços d'accés d'un sol ús. El token en clar no arriba mai aquí: només el
 * seu SHA-256.
 */
export const AccessTokensRepository = {
  findByCodeHash(codeHash: string): AccessTokenRow | undefined {
    return db.select().from(accessTokens).where(eq(accessTokens.code_hash, codeHash)).get();
  },

  create(data: AccessTokenInsert): void {
    db.insert(accessTokens).values(data).run();
  },

  deleteByUser(userId: string): void {
    db.delete(accessTokens).where(eq(accessTokens.user_id, userId)).run();
  },

  markUsed(id: string, usedAt: string): void {
    db.update(accessTokens).set({ used_at: usedAt }).where(eq(accessTokens.id, id)).run();
  },

  /**
   * Redimeix l'enllaç: desa la contrasenya triada i marca el token com a usat
   * en una sola transacció (o es fa tot o no es fa res).
   */
  redeem(params: {
    tokenId: string;
    userId: string;
    passwordHash: string;
    tokenVersion: number;
    usedAt: string;
  }): void {
    db.transaction((tx) => {
      tx.update(users)
        .set({ password_hash: params.passwordHash, token_version: params.tokenVersion })
        .where(eq(users.id, params.userId))
        .run();
      tx.update(accessTokens)
        .set({ used_at: params.usedAt })
        .where(eq(accessTokens.id, params.tokenId))
        .run();
    });
  },
};
