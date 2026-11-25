#!/usr/bin/env tsx
/**
 * Script per netejar tags OSM amb valors buits dels hidrants existents
 *
 * Problema: Alguns hidrants tenen tags com "disused:emergency": "" o "emergency": ""
 * que haurien d'haver estat eliminats en lloc de guardar-se com a strings buits.
 *
 * Aquest script:
 * 1. Llegeix tots els hidrants de la BD
 * 2. Parseja osm_tags de cada hidrant
 * 3. Elimina les claus amb valor buit ("")
 * 4. Actualitza la BD amb els tags nets
 *
 * Ús: npm run tsx src/scripts/cleanEmptyOsmTags.ts
 */

import { db } from '../db/index.js';
import { hidrants } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'osm', operation: 'clean_tags' });

async function cleanEmptyOsmTags() {
  log.info('🧹 Iniciant neteja de tags OSM buits...\n');

  try {
    // Obtenir tots els hidrants
    const allHidrants = db.select().from(hidrants).all();

    log.info({ count: allHidrants.length }, '📊 Total d\'hidrants a la BD');

    let updatedCount = 0;
    let emptyTagsFound = 0;

    for (const hidrant of allHidrants) {
      const osmTags: Record<string, unknown> = hidrant.osm_tags ?? {};
      const originalKeys = Object.keys(osmTags);

      // Filtrar tags amb valor buit
      const cleanedTags: Record<string, string> = {};
      let hasEmptyTags = false;

      for (const [key, value] of Object.entries(osmTags)) {
        if (value === '' || value === null || value === undefined) {
          hasEmptyTags = true;
          emptyTagsFound++;
          log.warn(
            `  ⚠️  Hidrant ${hidrant.id}: Tag buit detectat: "${key}": "${value}"`
          );
        } else {
          cleanedTags[key] = value as string;
        }
      }

      // Si hi havia tags buits, actualitzar la BD
      if (hasEmptyTags) {
        const cleanedKeys = Object.keys(cleanedTags);
        log.info({ hidrant_id: hidrant.id }, '  ✏️  Actualitzant hidrant');
        log.info(
          `     Abans: ${originalKeys.length} tags -> Després: ${cleanedKeys.length} tags`
        );
        log.info(
          `     Tags eliminats: ${originalKeys
            .filter((k) => !cleanedKeys.includes(k))
            .join(', ')}\n`
        );

        db.update(hidrants)
          .set({ osm_tags: cleanedTags })
          .where(eq(hidrants.id, hidrant.id))
          .run();

        updatedCount++;
      }
    }

    log.info('\n✅ Neteja completada!');
    log.info({ allHidrants: allHidrants.length, updated: updatedCount, emptyTags: emptyTagsFound }, '📈 Resum de neteja');

    if (updatedCount === 0) {
      log.info(
        "\n🎉 No s'han trobat tags buits. La base de dades ja estava neta!"
      );
    }
  } catch (error) {
    log.error({ error }, '❌ Error durant la neteja');
    process.exit(1);
  }
}

// Executar el script
await cleanEmptyOsmTags();
