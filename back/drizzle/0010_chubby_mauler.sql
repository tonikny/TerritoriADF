PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_access_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_access_tokens`("id", "user_id", "code_hash", "expires_at", "used_at", "created_at") SELECT "id", "user_id", "code_hash", "expires_at", "used_at", "created_at" FROM `access_tokens`;--> statement-breakpoint
DROP TABLE `access_tokens`;--> statement-breakpoint
ALTER TABLE `__new_access_tokens` RENAME TO `access_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_access_tokens_user_id` ON `access_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_tokens_code_hash_unique` ON `access_tokens` (`code_hash`);--> statement-breakpoint
CREATE TABLE `__new_hidrants` (
	`id` text PRIMARY KEY NOT NULL,
	`osm_id` integer,
	`osm_version` integer,
	`adf_id` integer,
	`municipi` text,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`osm_tags` text DEFAULT '{}',
	`private_tags` text DEFAULT '{}',
	`sync_status` text DEFAULT 'SYNCED',
	`sync_error` text,
	`synced_at` text,
	`remote_lat` real,
	`remote_lon` real,
	`remote_osm_tags` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`adf_id`) REFERENCES `adfs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_hidrants`("id", "osm_id", "osm_version", "adf_id", "municipi", "lat", "lon", "osm_tags", "private_tags", "sync_status", "sync_error", "synced_at", "remote_lat", "remote_lon", "remote_osm_tags", "created_at", "updated_at") SELECT "id", "osm_id", "osm_version", "adf_id", "municipi", "lat", "lon", "osm_tags", "private_tags", "sync_status", "sync_error", "synced_at", "remote_lat", "remote_lon", "remote_osm_tags", "created_at", "updated_at" FROM `hidrants`;--> statement-breakpoint
DROP TABLE `hidrants`;--> statement-breakpoint
ALTER TABLE `__new_hidrants` RENAME TO `hidrants`;--> statement-breakpoint
CREATE INDEX `idx_hidrants_adf` ON `hidrants` (`adf_id`);--> statement-breakpoint
CREATE INDEX `idx_hidrants_osm_id` ON `hidrants` (`osm_id`);--> statement-breakpoint
CREATE INDEX `idx_hidrants_sync_status` ON `hidrants` (`sync_status`);--> statement-breakpoint
CREATE TABLE `__new_incidencia_events` (
	`id` text PRIMARY KEY NOT NULL,
	`incidencia_id` text NOT NULL,
	`usuari_id` text,
	`tipus_event` text NOT NULL,
	`dades` text DEFAULT '{}',
	`creat_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`incidencia_id`) REFERENCES `incidencies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usuari_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_incidencia_events`("id", "incidencia_id", "usuari_id", "tipus_event", "dades", "creat_at") SELECT "id", "incidencia_id", "usuari_id", "tipus_event", "dades", "creat_at" FROM `incidencia_events`;--> statement-breakpoint
DROP TABLE `incidencia_events`;--> statement-breakpoint
ALTER TABLE `__new_incidencia_events` RENAME TO `incidencia_events`;--> statement-breakpoint
CREATE INDEX `idx_events_incidencia` ON `incidencia_events` (`incidencia_id`);--> statement-breakpoint
CREATE TABLE `__new_incidencies` (
	`id` text PRIMARY KEY NOT NULL,
	`titol` text NOT NULL,
	`tipus` text NOT NULL,
	`estat` text DEFAULT 'OBERT',
	`prioritat` text DEFAULT 'MITJANA',
	`adf_id` integer,
	`lat` real NOT NULL,
	`lon` real NOT NULL,
	`precisio` text DEFAULT 'DESCONEGUDA',
	`visibilitat` text DEFAULT 'ADF_PRIVADA',
	`creat_at` text DEFAULT CURRENT_TIMESTAMP,
	`actualitzat_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`adf_id`) REFERENCES `adfs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_incidencies`("id", "titol", "tipus", "estat", "prioritat", "adf_id", "lat", "lon", "precisio", "visibilitat", "creat_at", "actualitzat_at") SELECT "id", "titol", "tipus", "estat", "prioritat", "adf_id", "lat", "lon", "precisio", "visibilitat", "creat_at", "actualitzat_at" FROM `incidencies`;--> statement-breakpoint
DROP TABLE `incidencies`;--> statement-breakpoint
ALTER TABLE `__new_incidencies` RENAME TO `incidencies`;--> statement-breakpoint
CREATE INDEX `idx_incidencies_adf` ON `incidencies` (`adf_id`);--> statement-breakpoint
CREATE INDEX `idx_incidencies_estat` ON `incidencies` (`estat`);--> statement-breakpoint
CREATE TABLE `__new_mqtt_users` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mqtt_username` text NOT NULL,
	`mqtt_password_enc` text,
	`enabled` integer DEFAULT false,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_mqtt_users`("id", "user_id", "mqtt_username", "mqtt_password_enc", "enabled", "created_at") SELECT "id", "user_id", "mqtt_username", "mqtt_password_enc", "enabled", "created_at" FROM `mqtt_users`;--> statement-breakpoint
DROP TABLE `mqtt_users`;--> statement-breakpoint
ALTER TABLE `__new_mqtt_users` RENAME TO `mqtt_users`;--> statement-breakpoint
CREATE INDEX `idx_mqtt_users_user_id` ON `mqtt_users` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mqtt_users_mqtt_username_unique` ON `mqtt_users` (`mqtt_username`);--> statement-breakpoint
CREATE TABLE `__new_telegram_bots` (
	`id` text PRIMARY KEY NOT NULL,
	`adf_id` integer NOT NULL,
	`bot_id` integer NOT NULL,
	`bot_username` text NOT NULL,
	`bot_name` text,
	`token_enc` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`chat_id` integer,
	`group_name` text,
	`estat` text DEFAULT 'NO_CONFIGURAT',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`adf_id`) REFERENCES `adfs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telegram_bots`("id", "adf_id", "bot_id", "bot_username", "bot_name", "token_enc", "webhook_secret", "chat_id", "group_name", "estat", "created_at", "updated_at") SELECT "id", "adf_id", "bot_id", "bot_username", "bot_name", "token_enc", "webhook_secret", "chat_id", "group_name", "estat", "created_at", "updated_at" FROM `telegram_bots`;--> statement-breakpoint
DROP TABLE `telegram_bots`;--> statement-breakpoint
ALTER TABLE `__new_telegram_bots` RENAME TO `telegram_bots`;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_bots_adf_id_unique` ON `telegram_bots` (`adf_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_bots_bot_id_unique` ON `telegram_bots` (`bot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_bots_chat_id_unique` ON `telegram_bots` (`chat_id`);--> statement-breakpoint
CREATE TABLE `__new_telegram_links` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_bot_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`telegram_bot_id`) REFERENCES `telegram_bots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_telegram_links`("id", "telegram_bot_id", "code_hash", "expires_at", "used_at", "created_at") SELECT "id", "telegram_bot_id", "code_hash", "expires_at", "used_at", "created_at" FROM `telegram_links`;--> statement-breakpoint
DROP TABLE `telegram_links`;--> statement-breakpoint
ALTER TABLE `__new_telegram_links` RENAME TO `telegram_links`;--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_links_code_hash_unique` ON `telegram_links` (`code_hash`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`adf_id` integer,
	`role` text DEFAULT 'voluntari',
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (`adf_id`) REFERENCES `adfs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "username", "password_hash", "token_version", "adf_id", "role", "created_at") SELECT "id", "username", "password_hash", "token_version", "adf_id", "role", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE INDEX `idx_users_username` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_adf` ON `users` (`adf_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);