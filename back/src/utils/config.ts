import { z } from "zod";
import dotenv from "dotenv";
import { logger } from "./logger.js";

const log = logger.child({ module: "config", operation: "load" });

dotenv.config();

const configSchema = z.object({
  // Domini públic de l'aplicació, sense protocol. És l'única font per a
  // nginx/certs i el host per defecte del fitxer .otrc.
  BASE_DOMAIN_URL: z.string().default("localhost"),
  PORT: z.coerce.number().default(3033),
  // Si hi ha un proxy invers al davant (nginx, Caddy), activa-ho perquè `request.ip`
  // sigui la IP real del client (capçalera X-Forwarded-For) i els límits per IP funcionin.
  // No ho activis si el backend està exposat directament: permetria falsejar la IP.
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  OVERPASS_URL: z.string().default("https://overpass-api.de/api/interpreter"),
  // Contacte (normalment un correu) que s'afegeix al User-Agent de les consultes
  // a Overpass. La política d'ús d'Overpass demana un contacte vàlid; és opcional
  // perquè no és cap secret i cada desplegament hi posa el seu.
  OVERPASS_CONTACT: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  GRAPHHOPPER_API_KEY: z.string().optional(),
  FASTIFY_LOGLEVEL: z.string().default("info"),
  // Sense valor per defecte: si falten, el backend no arrenca. Així una instal·lació
  // no pot quedar-se signant JWT amb una clau pública coneguda.
  JWT_SECRET: z.string().min(32, "JWT_SECRET ha de tenir com a mínim 32 caràcters"),

  ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET ha de tenir com a mínim 32 caràcters"),

  MQTT_BROKER_URL: z.string().default("mqtt://mosquitto:1883"),
  MQTT_ADMIN_USERNAME: z.string().default("admin"),
  MQTT_ADMIN_PASSWORD: z.string().min(1, "MQTT_ADMIN_PASSWORD requerit"),
  MQTT_BACKEND_USERNAME: z.string().default("backend"),
  MQTT_BACKEND_PASSWORD: z.string().min(1, "MQTT_BACKEND_PASSWORD requerit"),
  MQTT_TOPIC_PREFIX: z.string().default("owntracks/hidrants"),

  // Opcional: només per al .otrc d'OwnTracks quan el broker és en un host
  // diferent de BASE_DOMAIN_URL. No és obligatòria.
  OTRC_HOST: z.string().optional(),
  OTRC_PORT: z.coerce.number().default(51823),
  OTRC_TLS: z
    .string()
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  // URL pública https on Telegram arribi al webhook. Necessari en dev local
  // (túnel com cloudflared/ngrok) o per forçar un domini concret. En producció
  // es deriva automàticament del Host de la petició.
  WEBHOOK_PUBLIC_URL: z.string().optional(),

  // OSM — Sincronització push (BD → OSM)
  // Token OAuth 2.0 per publicar canvis a l'API d'OSM.
  // Obtenir-lo a: https://www.openstreetmap.org/oauth2/applications
  // Scope necessari: write_api
  OSM_ACCESS_TOKEN: z.string().optional(),
  OSM_API_URL: z.string().default("https://api.openstreetmap.org/api/0.6"),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  log.error("❌ Error en la configuració de les variables d'entorn:");
  log.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
