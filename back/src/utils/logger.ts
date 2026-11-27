import { pino, type LoggerOptions } from "pino";

/** Text únic amb què es substitueixen els valors censurats. */
export const LOG_CENSOR = "[REDACTED]";

/**
 * Camps que no han d'arribar mai al log.
 *
 * Un log filtrat és una fuita de credencials: la cookie de sessió (`auth_token`),
 * la capçalera `Authorization` i els secrets que viatgen o es desen (contrasenyes,
 * tokens d'OSM i Telegram, secrets de webhook, contrasenyes MQTT) no s'hi han de
 * veure mai. El serializer de peticions de Fastify no inclou capçaleres, però un
 * `log.error({ req })` o un `log.info({ body })` manual sí que les hi portaria;
 * `redact` ho tapa a l'única sortida del logger.
 *
 * El `*` de pino cobreix un sol nivell i **no** cobreix l'arrel: per això hi ha
 * les entrades planes (`password`, `token`…), les niades (`*.token`) i les niades
 * dos nivells (`*.*.token`), que són les que apareixen quan el secret va dins
 * d'un cos de petició o d'un objecte d'error.
 */
export const LOG_REDACT_PATHS = [
  // Capçaleres d'entrada i de sortida. El secret del webhook de Telegram
  // (`x-telegram-bot-api-secret-token`) és una credencial més: qui el tingui pot
  // fer-se passar per Telegram davant del backend.
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers['x-telegram-bot-api-secret-token']",
  "req.headers['proxy-authorization']",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  "headers.cookie",
  "headers.authorization",
  "headers['x-telegram-bot-api-secret-token']",
  "headers['proxy-authorization']",
  "headers['x-api-key']",
  // Camps plans (arrel del registre).
  "password",
  "currentPassword",
  "newPassword",
  "password_hash",
  "token",
  "token_enc",
  "bot_token",
  "webhook_secret",
  "mqtt_password",
  "mqtt_password_enc",
  "secret",
  // Enllaç d'un sol ús per triar contrasenya (`/acces/<token>`): el token de la
  // URL és la credencial, així que la URL sencera no ha de sortir al log.
  "access_url",
  // Camps niats un nivell (cos de petició, usuari, bot…).
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.password_hash",
  "*.token",
  "*.token_enc",
  "*.bot_token",
  "*.webhook_secret",
  "*.mqtt_password",
  "*.mqtt_password_enc",
  "*.secret",
  "*.access_url",
  // Camps niats dos nivells (`{ body: { user: { password } } }`).
  "*.*.password",
  "*.*.token",
  "*.*.token_enc",
  "*.*.secret",
] as const;

/**
 * Camins on el secret viatja a la URL i, per tant, `redact` no hi pot arribar:
 * substitueix camps, no trossos de text. El webhook de Telegram duu el secret
 * del bot a `/api/telegram/webhook/:secret`.
 */
const SECRET_URL_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /^(\/api\/telegram\/webhook\/)[^/?#]+/, replacement: "$1" + LOG_CENSOR },
];

/** Substitueix per `[REDACTED]` els secrets que formen part del camí. */
export function maskSecretUrl(url: string): string {
  return SECRET_URL_PATTERNS.reduce(
    (masked, { pattern, replacement }) => masked.replace(pattern, replacement),
    url,
  );
}

/** El que el serializer necessita; ho compleixen tant `FastifyRequest` com l'`req` cru. */
interface RequestLike {
  method: string;
  url: string;
  host?: string;
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remotePort?: number } | null;
}

/**
 * El mateix serializer de peticions que fa servir Fastify (`method`, `url`,
 * `host`…), amb el camí sense secrets. Sense això, cada crida al webhook de
 * Telegram escriuria el secret del bot al log a nivell `info`; Fastify agafa
 * aquest serializer per sobre del seu (vegeu `lib/logger-factory.js`).
 */
export function serializeRequest(request: RequestLike): Record<string, unknown> {
  return {
    method: request.method,
    url: maskSecretUrl(request.url),
    version: request.headers?.["accept-version"],
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  };
}

/**
 * Opcions úniques del logger del procés. S'exporten perquè els tests comprovin
 * la redacció amb un stream propi, sense dependre de stdout.
 */
export const loggerOptions: LoggerOptions = {
  level: process.env.FASTIFY_LOGLEVEL || "info",
  redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_CENSOR },
  serializers: { req: serializeRequest },
};

export const logger = pino(loggerOptions);
