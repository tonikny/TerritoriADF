import { logError } from "./log";
import { sendHydrantNotification, type HydrantNotification } from "@/shared/api/telegram";

/**
 * Notifica a Telegram un canvi d'hidrant. La crida va pel client d'API; aquí
 * només s'hi afegeix el log (les crides a Telegram no han de tombar l'operació,
 * i qui crida decideix si la fallada importa).
 */
export async function sendToTelegram(data: HydrantNotification): Promise<void> {
  try {
    await sendHydrantNotification(data);
  } catch (err) {
    logError("Error enviant a Telegram", err);
    throw err;
  }
}
