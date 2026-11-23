import { db } from '../db/index.js';
import { adfs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';
import { updateAdfBoundaries } from '../services/adfBoundaries.js';

const log = logger.child({ module: 'adf', operation: 'update_boundaries' });

async function run() {
  const adfIdArg = process.argv[2];
  let allAdfs;

  if (adfIdArg) {
    const adfId = parseInt(adfIdArg);
    allAdfs = db.select().from(adfs).where(eq(adfs.id, adfId)).all();
    if (allAdfs.length === 0) {
      log.error({ adfId }, '❌ ADF no trobada');
      process.exit(1);
    }
    log.info(
      { adf_nom: allAdfs[0]?.nom },
      '🌍 Iniciant actualització de boundaries per a aquesta ADF',
    );
  } else {
    allAdfs = db.select().from(adfs).all();
    log.info('🌍 Iniciant actualització de boundaries a la base de dades...');
  }

  for (const adf of allAdfs) {
    log.info({ adf_id: adf.id, adf_nom: adf.nom }, '🔍 Processant ADF');
    try {
      await updateAdfBoundaries(adf.id);
      log.info({ adf_id: adf.id }, '✅ ADF actualitzada amb GeoJSON i BBox');
    } catch (err) {
      log.error(
        { adf_id: adf.id, error: err instanceof Error ? err.message : err },
        '⚠️ ADF saltada',
      );
    }
  }

  log.info('\n✨ Actualització de boundaries finalitzada.');
}

await run();
