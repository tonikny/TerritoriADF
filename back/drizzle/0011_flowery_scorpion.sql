PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`sync_status` text DEFAULT 'SYNCED' NOT NULL,
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
INSERT INTO `__new_hidrants`("id", "osm_id", "osm_version", "adf_id", "municipi", "lat", "lon", "osm_tags", "private_tags", "sync_status", "sync_error", "synced_at", "remote_lat", "remote_lon", "remote_osm_tags", "created_at", "updated_at") SELECT "id", "osm_id", "osm_version", "adf_id", "municipi", "lat", "lon", "osm_tags", "private_tags", coalesce("sync_status", 'SYNCED'), "sync_error", "synced_at", "remote_lat", "remote_lon", "remote_osm_tags", "created_at", "updated_at" FROM `hidrants`;--> statement-breakpoint
DROP TABLE `hidrants`;--> statement-breakpoint
ALTER TABLE `__new_hidrants` RENAME TO `hidrants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_hidrants_adf` ON `hidrants` (`adf_id`);--> statement-breakpoint
CREATE INDEX `idx_hidrants_osm_id` ON `hidrants` (`osm_id`);--> statement-breakpoint
CREATE INDEX `idx_hidrants_sync_status` ON `hidrants` (`sync_status`);