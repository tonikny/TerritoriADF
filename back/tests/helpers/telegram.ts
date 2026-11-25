import { vi } from "vitest";

import {
  TelegramBotsRepository,
  type TelegramBotInsert,
} from "../../src/db/repositories/telegramRepository.js";
import { encrypt } from "../../src/utils/crypto.js";
import { ADF_278 } from "./db.js";

/** Token amb el format de BotFather (6+ dígits, `:`, 30+ caràcters). */
export const TEST_TELEGRAM_TOKEN = `123456:${"A".repeat(30)}`;

/** Resposta JSON mínima per als stubs de `fetch`. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Bot de Telegram de l'ADF 278 vinculat al grup 777. Els tests canvien només el
 * camp que els interessa (`estat`, `chat_id`, `token_enc`, ...).
 */
export function createTelegramBot(overrides: Partial<TelegramBotInsert> = {}): void {
  TelegramBotsRepository.create({
    id: "bot-1",
    adf_id: ADF_278,
    bot_id: 555,
    bot_username: "bot_prova",
    bot_name: "Bot Prova",
    token_enc: encrypt(TEST_TELEGRAM_TOKEN),
    webhook_secret: "secret",
    chat_id: 777,
    estat: "CONFIGURAT",
    ...overrides,
  });
}

export interface TelegramFetchCall {
  url: string;
  body: Record<string, unknown>;
}

/**
 * Stub de `fetch` per a l'API de Telegram: respon com el servei real a `getMe`
 * i a la resta de mètodes (`setWebhook`, `deleteWebhook`, `sendMessage`). Cap
 * test no surt a la xarxa. Un test pot canviar-ne el comportament amb
 * `mockImplementation` per provar un error de Telegram.
 */
type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function telegramFetch() {
  return vi.fn<FetchFn>(async (input) => {
    if (String(input).endsWith("/getMe")) {
      return json({ ok: true, result: { id: 555, username: "bot_prova", first_name: "Bot" } });
    }
    return json({ ok: true, result: true });
  });
}

export type TelegramFetch = ReturnType<typeof telegramFetch>;

/** Crides fetes a un mètode concret (`sendMessage`, `setWebhook`, `deleteWebhook`, `getMe`). */
export function callsTo(fetchMock: TelegramFetch, method: string): TelegramFetchCall[] {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith(`/${method}`))
    .map(([input, init]) => ({
      url: String(input),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    }));
}

/** Cos JSON de la crida `index` a `fetch`; per defecte, la primera. */
export function bodyOf(
  fetchMock: { mock: { calls: unknown[][] } },
  index = 0,
): Record<string, unknown> {
  const call = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(call[1].body)) as Record<string, unknown>;
}
