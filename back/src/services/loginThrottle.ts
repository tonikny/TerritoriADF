/**
 * Fre de força bruta per al login
 *
 * Comptador **en memòria**: prou per a aquesta aplicació (una sola instància amb SQLite),
 * no afegeix dependències i no deixa rastre de credencials provades a la BD.
 * Es perd en reiniciar el procés: és un fre, no un registre d'auditoria.
 */
import { config } from "../utils/config.js";

/** Finestra lliscant: els intents fallits caduquen al cap de 15 minuts. */
const WINDOW_MS = 15 * 60 * 1000;

/** Intents fallits permesos per usuari abans de bloquejar-lo temporalment. */
const MAX_FAILURES_PER_USER = 5;

/**
 * Intents fallits permesos per IP. És molt més alt perquè darrere d'un proxy o d'una
 * xarxa compartida (una ADF, un mòbil amb CGNAT) hi ha molts usuaris legítims.
 */
const MAX_FAILURES_PER_IP = 30;

/** Claus: `user:<username normalitzat>` i `ip:<adreça>`. */
const failures = new Map<string, number[]>();

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((at) => now - at < WINDOW_MS);
}

function keysFor(username: string, ip: string | undefined): string[] {
  const keys = [`user:${username.trim().toLowerCase()}`];
  // Sense `TRUST_PROXY` no sabem la IP real del client: tots els usuaris darrere del
  // proxy compartirien comptador i es bloquejarien entre ells. Millor no limitar per IP.
  if (config.TRUST_PROXY && ip) {
    keys.push(`ip:${ip}`);
  }
  return keys;
}

function limitFor(key: string): number {
  return key.startsWith("ip:") ? MAX_FAILURES_PER_IP : MAX_FAILURES_PER_USER;
}

export interface LoginBlock {
  error: string;
  retryAfterSeconds: number;
}

function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/**
 * Retorna el bloqueig actiu per a aquest usuari/IP, o null si pot continuar.
 */
export function loginBlock(username: string, ip?: string): LoginBlock | null {
  const now = Date.now();
  let retryAfterSeconds = 0;

  for (const key of keysFor(username, ip)) {
    const recent = prune(failures.get(key) ?? [], now);
    const limit = limitFor(key);
    if (recent.length < limit) {
      continue;
    }
    // Es desbloqueja quan l'intent que fa que se superi el límit surt de la finestra.
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
    error: `Massa intents fallits. Torna-ho a provar d'aquí a ${minutes(retryAfterSeconds)} min.`,
    retryAfterSeconds,
  };
}

/** Apunta un intent fallit (usuari inexistent, contrasenya incorrecta…). */
export function registerLoginFailure(username: string, ip?: string): void {
  const now = Date.now();
  for (const key of keysFor(username, ip)) {
    const recent = prune(failures.get(key) ?? [], now);
    recent.push(now);
    failures.set(key, recent);
  }
}

/** Un login correcte neteja els comptadors d'aquest usuari i d'aquesta IP. */
export function resetLoginFailures(username: string, ip?: string): void {
  for (const key of keysFor(username, ip)) {
    failures.delete(key);
  }
}

// Neteja periòdica perquè un atac amb usernames aleatoris no faci créixer el Map sense fi.
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of failures) {
    const recent = prune(timestamps, now);
    if (recent.length > 0) {
      failures.set(key, recent);
    } else {
      failures.delete(key);
    }
  }
}, WINDOW_MS).unref();
