-- V3-12: les columnes JSON passen a `text(..., { mode: "json" })`, de manera que
-- Drizzle les deserialitza en llegir. Abans de canviar el codi cal que TOTES les
-- files siguin JSON amb la forma esperada: un text pla o un JSON d'una altra
-- forma faria fallar la lectura sencera.
--
-- `sync_error` passa a una unió discriminada per `kind`:
--   { kind: "conflict", ... } | { kind: "review", issues: [...] } | { kind: "error", message }
-- Les files antigues (array de warnings, objecte de conflicte o text pla) es
-- normalitzen aquí; el que no es pot interpretar es descarta com a error.
UPDATE `hidrants` SET `sync_error` = NULL WHERE `sync_error` = '';--> statement-breakpoint
UPDATE `hidrants`
  SET `sync_error` = json_object('kind', 'review', 'issues', json(`sync_error`))
  WHERE `sync_error` IS NOT NULL AND json_valid(`sync_error`) AND json_type(`sync_error`) = 'array';--> statement-breakpoint
UPDATE `hidrants`
  SET `sync_error` = json_object('kind', 'error', 'message', `sync_error`)
  WHERE `sync_error` IS NOT NULL AND json_valid(`sync_error`) AND json_type(`sync_error`) <> 'object';--> statement-breakpoint
UPDATE `hidrants`
  SET `sync_error` = json_set(`sync_error`, '$.kind', 'conflict')
  WHERE `sync_error` IS NOT NULL AND json_valid(`sync_error`) AND json_type(`sync_error`) = 'object'
    AND json_extract(`sync_error`, '$.kind') IS NULL;--> statement-breakpoint
UPDATE `hidrants`
  SET `sync_error` = json_object('kind', 'error', 'message', `sync_error`)
  WHERE `sync_error` IS NOT NULL AND NOT json_valid(`sync_error`);--> statement-breakpoint

-- Columnes que han de ser objectes (tags). Les files buides o invàlides es
-- deixen en `{}`, que és el valor que el codi ja feia servir com a fallback.
UPDATE `hidrants`
  SET `osm_tags` = '{}'
  WHERE `osm_tags` IS NULL OR NOT json_valid(`osm_tags`) OR json_type(`osm_tags`) <> 'object';--> statement-breakpoint
UPDATE `hidrants`
  SET `service_tags` = '{}'
  WHERE `service_tags` IS NULL OR NOT json_valid(`service_tags`) OR json_type(`service_tags`) <> 'object';--> statement-breakpoint
UPDATE `hidrants`
  SET `private_tags` = '{}'
  WHERE `private_tags` IS NULL OR NOT json_valid(`private_tags`) OR json_type(`private_tags`) <> 'object';--> statement-breakpoint
UPDATE `hidrants`
  SET `remote_osm_tags` = NULL
  WHERE `remote_osm_tags` IS NOT NULL
    AND (NOT json_valid(`remote_osm_tags`) OR json_type(`remote_osm_tags`) <> 'object');--> statement-breakpoint

UPDATE `adfs`
  SET `osm_relations` = '[]'
  WHERE NOT json_valid(`osm_relations`) OR json_type(`osm_relations`) <> 'array';--> statement-breakpoint
UPDATE `adfs`
  SET `bbox` = NULL
  WHERE `bbox` IS NOT NULL AND (NOT json_valid(`bbox`) OR json_type(`bbox`) <> 'array');--> statement-breakpoint
UPDATE `adfs`
  SET `center` = NULL
  WHERE `center` IS NOT NULL AND (NOT json_valid(`center`) OR json_type(`center`) <> 'array');--> statement-breakpoint
UPDATE `adfs`
  SET `boundary_geojson` = NULL
  WHERE `boundary_geojson` IS NOT NULL
    AND (NOT json_valid(`boundary_geojson`) OR json_type(`boundary_geojson`) <> 'object');--> statement-breakpoint

UPDATE `incidencia_events`
  SET `dades` = '{}'
  WHERE `dades` IS NULL OR NOT json_valid(`dades`) OR json_type(`dades`) <> 'object';
