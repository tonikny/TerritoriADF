// Notificació d'un canvi d'hidrant al grup de Telegram de l'ADF.
// Viu a shared perquè la fan servir hidrants i les accions d'OSM; la
// configuració del bot pertany a la feature de Telegram.
import { logError } from "@/utils/log";

import { request } from "./client";

export interface HydrantNotification {
  lat: number;
  lon: number;
  tags?: unknown;
  originalData?: unknown;
  changes?: unknown;
  adf_id?: number;
  isEdit?: boolean;
  action?: "create" | "delete";
}

/**
 * Notifica el canvi. La crida no ha de tombar l'operació: es registra l'error i
 * qui crida decideix si la fallada importa.
 */
export async function sendToTelegram(payload: HydrantNotification): Promise<void> {
  try {
    await request<unknown>("/api/sendToTelegram", { method: "POST", body: payload });
  } catch (err) {
    logError("Error enviant a Telegram", err);
    throw err;
  }
}
