/**
 * Fre anti-spam per a /api/sendToTelegram (notificacions).
 *
 * Comptador **en memòria**: prou per a aquesta aplicació (una sola instància amb SQLite),
 * mateix patró que `loginThrottle.ts`. Es perd en reiniciar el procés: és un fre,
 * no un registre d'auditoria.
 */
import { config } from "../utils/config.js";

/** Finestra lliscant: les notificacions caduquen al cap de 5 minuts. */
const WINDOW_MS = 5 * 60 * 1000;

/** Notificacions permeses per usuari dins la finestra. */
const MAX_PER_USER = 15;

/** Notificacions permeses per IP (xarxes compartides/CGNAT). */
const MAX_PER_IP = 60;

/** Claus: `user:<id>` i `ip:<adreça>`. */
const hits = new Map<string, number[]>();

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((at) => now - at < WINDOW_MS);
}

function keysFor(userId: string | undefined, ip: string | undefined): string[] {
  const keys: string[] = [];
  if (userId) {
    keys.push(`user:${userId}`);
  }
  // Sense `TRUST_PROXY` no sabem la IP real: tots els usuaris darrere del
  // proxy compartirien comptador. Només limitem per IP si és fiable.
  if (config.TRUST_PROXY && ip) {
    keys.push(`ip:${ip}`);
  }
  return keys;
}

function limitFor(key: string): number {
  return key.startsWith("ip:") ? MAX_PER_IP : MAX_PER_USER;
}

export interface TelegramBlock {
  error: string;
  retryAfterSeconds: number;
}

/** Retorna el bloqueig actiu, o null si pot continuar. */
export function telegramBlock(userId: string | undefined, ip?: string): TelegramBlock | null {
  const now = Date.now();
  let retryAfterSeconds = 0;

  for (const key of keysFor(userId, ip)) {
    const recent = prune(hits.get(key) ?? [], now);
    const limit = limitFor(key);
    if (recent.length < limit) {
      continue;
    }
    const oldestRelevant = recent[recent.length - limit];
    retryAfterSeconds = Math.max(
      retryAfterSeconds,
      Math.ceil((oldestRelevant + WINDOW_MS - now) / 1000),
    );
  }

  if (retryAfterSeconds <= 0) {
    return null;
  }
  return {
    error: "Massa notificacions. Torna-ho a provar d'aquí a una estona.",
    retryAfterSeconds,
  };
}

/** Apunta una notificació enviada. */
export function registerTelegramHit(userId: string | undefined, ip?: string): void {
  const now = Date.now();
  for (const key of keysFor(userId, ip)) {
    const recent = prune(hits.get(key) ?? [], now);
    recent.push(now);
    hits.set(key, recent);
  }
}

// Neteja periòdica perquè el Map no creixi sense fi.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of hits) {
    const recent = prune(timestamps, now);
    if (recent.length > 0) {
      hits.set(key, recent);
    } else {
      hits.delete(key);
    }
  }
}, WINDOW_MS).unref();
