import { sqliteTable, text, integer, real, unique, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { SYNC_STATUSES } from "@territoriadf/contracts/sync";

export const adfs = sqliteTable("adfs", {
  id: integer("id").primaryKey(), // Número d'ADF
  nom: text("nom").notNull(),
  osm_relations: text("osm_relations").notNull(), // JSON array de strings
  bbox: text("bbox"), // JSON array de 4 números
  center: text("center"), // JSON array de 2 números
  boundary_geojson: text("boundary_geojson"), // GeoJSON del límit territorial
  tracking_shared: integer("tracking_shared", { mode: "boolean" }).default(false),
  created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const hidrants = sqliteTable(
  "hidrants",
  {
    id: text("id").primaryKey(),
    osm_id: integer("osm_id"),
    osm_version: integer("osm_version"),
    // Els hidrants són dades d'OSM: si s'esborra una ADF no s'han de perdre.
    adf_id: integer("adf_id").references(() => adfs.id, { onDelete: "set null" }),
    municipi: text("municipi"), // Mantinguem el nom del municipi per info visual
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    osm_tags: text("osm_tags").default("{}"),
    private_tags: text("private_tags").default("{}"),
    sync_status: text("sync_status", { enum: [...SYNC_STATUSES] }).default("SYNCED"),
    sync_error: text("sync_error"), // JSON: detalls de l'error o del conflicte
    synced_at: text("synced_at"), // ISO: timestamp de l'última pujada exitosa a OSM
    remote_lat: real("remote_lat"), // Latitud de la versió remota d'OSM (per al diff)
    remote_lon: real("remote_lon"), // Longitud de la versió remota d'OSM (per al diff)
    remote_osm_tags: text("remote_osm_tags"), // Tags de la versió remota d'OSM (JSON)
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    adfIdx: index("idx_hidrants_adf").on(t.adf_id),
    osmIdIdx: index("idx_hidrants_osm_id").on(t.osm_id),
    syncStatusIdx: index("idx_hidrants_sync_status").on(t.sync_status),
  }),
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    password_hash: text("password_hash").notNull(),
    // Versió del token: s'incrementa a cada canvi de contrasenya i invalida
    // totes les cookies JWT anteriors (el JWT només porta l'id + aquesta versió).
    token_version: integer("token_version").notNull().default(0),
    // L'usuari sobreviu a la seva ADF (queda sense abast fins que se n'hi assigni una).
    adf_id: integer("adf_id").references(() => adfs.id, { onDelete: "set null" }),
    role: text("role", { enum: ["admin", "coordinador", "voluntari"] }).default("voluntari"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    usernameIdx: index("idx_users_username").on(t.username),
    adfIdx: index("idx_users_adf").on(t.adf_id),
    unq: unique().on(t.username),
  }),
);

/** Enllaços d'accés d'un sol ús (/acces/<token>): només es desa el hash del token. */
export const accessTokens = sqliteTable(
  "access_tokens",
  {
    id: text("id").primaryKey(), // UUID
    // Enllaç d'un sol ús d'un usuari: sense l'usuari no té cap sentit.
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code_hash: text("code_hash").notNull(), // SHA-256 del token
    expires_at: text("expires_at").notNull(), // ISO
    used_at: text("used_at"), // ISO un cop consumit
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    codeUnq: unique().on(t.code_hash), // un sol ús
    userIdIdx: index("idx_access_tokens_user_id").on(t.user_id),
  }),
);

export const mqttUsers = sqliteTable(
  "mqtt_users",
  {
    id: text("id").primaryKey(),
    // La identitat MQTT d'un usuari esborrat no serveix per a res.
    user_id: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mqtt_username: text("mqtt_username").notNull(),
    mqtt_password_enc: text("mqtt_password_enc"),
    enabled: integer("enabled", { mode: "boolean" }).default(false),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    userIdIdx: index("idx_mqtt_users_user_id").on(t.user_id),
    mqttUsernameUnq: unique().on(t.mqtt_username),
  }),
);

export const incidencies = sqliteTable(
  "incidencies",
  {
    id: text("id").primaryKey(), // UUID
    titol: text("titol").notNull(),
    tipus: text("tipus").notNull(),
    estat: text("estat", { enum: ["OBERT", "EN_PROGRES", "RESOLT", "TANCAT"] }).default("OBERT"),
    prioritat: text("prioritat", { enum: ["BAIXA", "MITJANA", "ALTA"] }).default("MITJANA"),
    // Les incidències són historial: es conserven encara que desaparegui l'ADF.
    adf_id: integer("adf_id").references(() => adfs.id, { onDelete: "set null" }),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    precisio: text("precisio", { enum: ["DESCONEGUDA", "MUNICIPI", "AREA", "EXACTA"] }).default(
      "DESCONEGUDA",
    ),
    visibilitat: text("visibilitat", { enum: ["PUBLICA", "TOTES_ADFS", "ADF_PRIVADA"] }).default(
      "ADF_PRIVADA",
    ),
    creat_at: text("creat_at").default(sql`CURRENT_TIMESTAMP`),
    actualitzat_at: text("actualitzat_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    adfIdx: index("idx_incidencies_adf").on(t.adf_id),
    estatIdx: index("idx_incidencies_estat").on(t.estat),
  }),
);

export const incidencia_events = sqliteTable(
  "incidencia_events",
  {
    id: text("id").primaryKey(), // UUID
    // Els esdeveniments són fills propis de la incidència; l'autor és historial.
    incidencia_id: text("incidencia_id")
      .notNull()
      .references(() => incidencies.id, { onDelete: "cascade" }),
    usuari_id: text("usuari_id").references(() => users.id, { onDelete: "set null" }),
    tipus_event: text("tipus_event").notNull(),
    dades: text("dades").default("{}"), // JSON
    creat_at: text("creat_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    incidenciaIdx: index("idx_events_incidencia").on(t.incidencia_id),
  }),
);

export const telegramBots = sqliteTable(
  "telegram_bots",
  {
    id: text("id").primaryKey(), // UUID
    // La configuració del bot és regenerable: cau amb la seva ADF.
    adf_id: integer("adf_id")
      .notNull()
      .references(() => adfs.id, { onDelete: "cascade" }),
    bot_id: integer("bot_id").notNull(),
    bot_username: text("bot_username").notNull(),
    bot_name: text("bot_name"),
    token_enc: text("token_enc").notNull(), // xifrat (aes-256-gcm)
    webhook_secret: text("webhook_secret").notNull(),
    chat_id: integer("chat_id"),
    group_name: text("group_name"), // Nom del grup vinculat (nom del bot dins el grup)
    estat: text("estat", {
      enum: ["NO_CONFIGURAT", "BOT_CONFIGURAT", "GRUP_PENDENT", "CONFIGURAT", "DESACTIVAT"],
    }).default("NO_CONFIGURAT"),
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    adfUnq: unique().on(t.adf_id), // una ADF = un bot actiu
    botUnq: unique().on(t.bot_id), // un bot = una ADF
    chatUnq: unique().on(t.chat_id), // un grup = una ADF
  }),
);

export const telegramLinks = sqliteTable(
  "telegram_links",
  {
    id: text("id").primaryKey(), // UUID
    telegram_bot_id: text("telegram_bot_id")
      .notNull()
      .references(() => telegramBots.id, { onDelete: "cascade" }),
    code_hash: text("code_hash").notNull(), // SHA-256 del codi de vinculació
    expires_at: text("expires_at").notNull(), // ISO
    used_at: text("used_at"), // ISO un cop consumit
    created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    codeUnq: unique().on(t.code_hash), // un sol ús
  }),
);
