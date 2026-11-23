// Configuració del bot i del grup de Telegram d'una ADF.
import type {
  TelegramLinkResponse,
  TelegramStatusResponse,
} from "@territoriadf/contracts/telegram";

import { request } from "@/shared/api/client";

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
