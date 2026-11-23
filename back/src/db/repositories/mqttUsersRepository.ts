import { and, eq } from "drizzle-orm";
import { db } from "../index.js";
import { mqttUsers } from "../schema.js";

export type MqttUserRow = typeof mqttUsers.$inferSelect;
export type MqttUserInsert = typeof mqttUsers.$inferInsert;
export type MqttUserUpdate = Partial<Omit<MqttUserInsert, "id">>;

/** Accés a les identitats MQTT (client DynSec + contrasenya xifrada). */
export const MqttUsersRepository = {
  findByUserId(userId: string): MqttUserRow | undefined {
    return db.select().from(mqttUsers).where(eq(mqttUsers.user_id, userId)).get();
  },

  findEnabledByUserId(userId: string): MqttUserRow | undefined {
    return db
      .select()
      .from(mqttUsers)
      .where(and(eq(mqttUsers.user_id, userId), eq(mqttUsers.enabled, true)))
      .get();
  },

  insert(data: MqttUserInsert): void {
    db.insert(mqttUsers).values(data).run();
  },

  update(id: string, data: MqttUserUpdate): void {
    if (Object.keys(data).length === 0) {
      return;
    }
    db.update(mqttUsers).set(data).where(eq(mqttUsers.id, id)).run();
  },
};
