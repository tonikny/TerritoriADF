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
  // Capçaleres d'entrada i de sortida.
  "req.headers.cookie",
  "req.headers.authorization",
  "res.headers['set-cookie']",
  "headers.cookie",
  "headers.authorization",
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
  // Camps niats dos nivells (`{ body: { user: { password } } }`).
  "*.*.password",
  "*.*.token",
  "*.*.token_enc",
  "*.*.secret",
] as const;

/**
 * Opcions úniques del logger del procés. S'exporten perquè els tests comprovin
 * la redacció amb un stream propi, sense dependre de stdout.
 */
export const loggerOptions: LoggerOptions = {
  level: process.env.FASTIFY_LOGLEVEL || "info",
  redact: { paths: [...LOG_REDACT_PATHS], censor: LOG_CENSOR },
};

export const logger = pino(loggerOptions);
