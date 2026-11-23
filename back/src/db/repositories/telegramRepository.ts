import { and, eq, ne } from "drizzle-orm";
import { db } from "../index.js";
import { telegramBots, telegramLinks } from "../schema.js";

export type TelegramBotRow = typeof telegramBots.$inferSelect;
export type TelegramBotInsert = typeof telegramBots.$inferInsert;
export type TelegramBotUpdate = Partial<Omit<TelegramBotInsert, "id">>;

export type TelegramLinkRow = typeof telegramLinks.$inferSelect;
export type TelegramLinkInsert = typeof telegramLinks.$inferInsert;

/** Bots de Telegram per ADF (un bot actiu per ADF). */
export const TelegramBotsRepository = {
  findByAdf(adfId: number): TelegramBotRow | undefined {
    return db.select().from(telegramBots).where(eq(telegramBots.adf_id, adfId)).get();
  },

  findConfiguredByAdf(adfId: number): TelegramBotRow | undefined {
    return db
      .select()
      .from(telegramBots)
      .where(and(eq(telegramBots.adf_id, adfId), eq(telegramBots.estat, "CONFIGURAT")))
      .get();
  },

  findByWebhookSecret(secret: string): TelegramBotRow | undefined {
    return db.select().from(telegramBots).where(eq(telegramBots.webhook_secret, secret)).get();
  },

  /** Un bot no pot estar assignat a dues ADFs. */
  findByBotIdExceptAdf(botId: number, adfId: number): TelegramBotRow | undefined {
    return db
      .select()
      .from(telegramBots)
      .where(and(eq(telegramBots.bot_id, botId), ne(telegramBots.adf_id, adfId)))
      .get();
  },

  /** Un grup no pot estar vinculat a dues ADFs. */
  findByChatIdExceptId(chatId: number, id: string): TelegramBotRow | undefined {
    return db
      .select()
      .from(telegramBots)
      .where(and(eq(telegramBots.chat_id, chatId), ne(telegramBots.id, id)))
      .get();
  },

  create(data: TelegramBotInsert): void {
    db.insert(telegramBots).values(data).run();
  },

  update(id: string, data: TelegramBotUpdate): void {
    if (Object.keys(data).length === 0) {
      return;
    }
    db.update(telegramBots).set(data).where(eq(telegramBots.id, id)).run();
  },

  delete(id: string): void {
    db.delete(telegramBots).where(eq(telegramBots.id, id)).run();
  },
};

/** Sol·licituds de vinculació grup ↔ bot (deep link startgroup). */
export const TelegramLinksRepository = {
  findByCodeHash(codeHash: string): TelegramLinkRow | undefined {
    return db.select().from(telegramLinks).where(eq(telegramLinks.code_hash, codeHash)).get();
  },

  create(data: TelegramLinkInsert): void {
    db.insert(telegramLinks).values(data).run();
  },

  markUsed(id: string, usedAt: string): void {
    db.update(telegramLinks).set({ used_at: usedAt }).where(eq(telegramLinks.id, id)).run();
  },

  deleteByBotId(botId: string): void {
    db.delete(telegramLinks).where(eq(telegramLinks.telegram_bot_id, botId)).run();
  },
};
