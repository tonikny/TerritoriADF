ALTER TABLE `hidrants` ADD `service_tags` text DEFAULT '{}';--> statement-breakpoint
-- ADR 0005: el contingut que fins ara vivia a `private_tags` era informació de
-- servei (observacions, accessos...) i passa a `service_tags`. `private_tags`
-- queda reservat per a dades que només veurà l'ADF propietària i, per tant, es
-- buida: el que hi havia no era privat de cap ADF.
UPDATE `hidrants` SET `service_tags` = `private_tags` WHERE `private_tags` IS NOT NULL AND `private_tags` <> '{}';--> statement-breakpoint
UPDATE `hidrants` SET `private_tags` = '{}' WHERE `private_tags` IS NOT NULL AND `private_tags` <> '{}';
