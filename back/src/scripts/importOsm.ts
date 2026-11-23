import { syncAdfFromOSM } from '../services/osmSync.js';
import { db } from '../db/index.js';
import { adfs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'osm', operation: 'import' });

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
     log.info({ adf_nom: allAdfs[0]?.nom }, '🚀 Iniciant importació d\'hidrants des d\'OSM per a aquesta ADF');
    } else {
      allAdfs = db.select().from(adfs).all();
      log.info({ adf_count: allAdfs.length }, '🚀 Iniciant importació d\'hidrants des d\'OSM');
    }

    for (const adf of allAdfs) {
      try {
        log.info({ adf_id: adf.id, adf_nom: adf.nom }, '🔍 Processant ADF');
        const count = await syncAdfFromOSM(adf.id);
        log.info({ count, adf_nom: adf.nom }, '✅ Hidrants sincronitzats per a aquesta ADF');
      } catch (error) {
        log.error({ error: error instanceof Error ? error.message : error, adf_nom: adf.nom }, '❌ Error sincronitzant');
      }
      
      // Esperem una mica entre ADFs per no saturar Overpass
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log.info('\n✨ Importació des d\'OSM finalitzada.');
}

await run();
