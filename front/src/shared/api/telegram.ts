// Configuració de Telegram per ADF i notificacions de canvis d'hidrant.
import type {
  TelegramLinkResponse,
  TelegramStatusResponse,
} from "@territoriadf/contracts/telegram";

import { request } from "./client";

/** Estat del bot i del grup de l'ADF (el panell el polla mentre és visible). */
export function getTelegramStatus(
  adfId: number,
  signal?: AbortSignal,
): Promise<TelegramStatusResponse> {
  return request<TelegramStatusResponse>(`/api/adfs/${adfId}/telegram/status`, { signal });
}

/** Valida i desa el token del bot de l'ADF. */
export function registerTelegramBot(adfId: number, token: string): Promise<TelegramStatusResponse> {
  return request<TelegramStatusResponse>(`/api/adfs/${adfId}/telegram`, {
    method: "POST",
    body: { token },
  });
}

/** Genera el deep link d'un sol ús per vincular el grup. */
export function createTelegramLink(adfId: number): Promise<TelegramLinkResponse> {
  return request<TelegramLinkResponse>(`/api/adfs/${adfId}/telegram/link`, { method: "POST" });
}

export async function sendTelegramTest(adfId: number, message: string): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}/telegram/test`, {
    method: "POST",
    body: { message },
  });
}

/** Desvincula el bot i el grup de l'ADF. */
export async function deleteTelegram(adfId: number): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}/telegram`, { method: "DELETE" });
}

/** Notificació al grup de Telegram d'un canvi d'hidrant. */
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

export async function sendHydrantNotification(payload: HydrantNotification): Promise<void> {
  await request<unknown>("/api/sendToTelegram", { method: "POST", body: payload });
}
