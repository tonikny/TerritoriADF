import { apiFetch } from "./api";
import { logError } from "./log";

interface SendPayload {
  lat: number;
  lon: number;
  tags?: unknown;
  originalData?: unknown;
  changes?: unknown;
  adf_id?: number;
  isEdit?: boolean;
  action?: "create" | "delete";
}

export async function sendToTelegram(data: SendPayload): Promise<void> {
  try {
    const res = await apiFetch("/api/sendToTelegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Error enviant el missatge: ${text}`);
    }
  } catch (err) {
    logError("Error enviant a Telegram", err);
    throw err;
  }
}
