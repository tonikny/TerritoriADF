/** Estat de la configuració de Telegram d'una ADF. */
export type TelegramStatus =
  | "NO_CONFIGURAT"
  | "BOT_CONFIGURAT"
  | "GRUP_PENDENT"
  | "CONFIGURAT"
  | "DESACTIVAT"
  /** El token desat no es pot desxifrar: cal tornar-lo a introduir. */
  | "TOKEN_INVALID";

/** Resposta de `GET /api/adfs/:id/telegram/status` i `POST /api/adfs/:id/telegram`. */
export interface TelegramStatusResponse {
  status: TelegramStatus;
  bot_username?: string | null;
  bot_name?: string | null;
  group_name?: string | null;
}

/** Resposta de `POST /api/adfs/:id/telegram/link` (deep link d'un sol ús). */
export interface TelegramLinkResponse {
  url: string;
  expires_at: string;
  bot_username: string;
  bot_name?: string | null;
}
