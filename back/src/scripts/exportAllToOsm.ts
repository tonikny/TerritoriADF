import { db } from '../db/index.js';
import { adfs, hidrants } from '../db/schema.js';
import { syncAdfFromOSM } from '../services/osmSync.js';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger.js';


const log = logger.child({ module: 'osm', operation: 'export' });

async function logToFile(message: string, fileStream?: fs.WriteStream) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  log.info(formattedMessage);
  if (fileStream) {
    fileStream.write(formattedMessage + '\n');
  }
}

function escapeXml(str: unknown) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parsePrivateDescription(desc?: string | { value?: string }) {
  if (!desc) {return {};}

  const raw = typeof desc === 'string' ? desc : desc.value || '';
  const lines = raw.split(/<br\s*\/?>/i).map((l: string) => l.trim()).filter(Boolean);

  let type = null;
  let couplings = null;
  let diameters = null;
  let pressure = null;

  for (const line of lines) {
    const l = line.toLowerCase();
    if (l.includes('aeri')) {type = 'pillar';}
    const cMatch = l.match(/(\d+)\s*ràcords?/);
    if (cMatch) {couplings = cMatch[1];}
    const dMatch = line.match(/(\d+(?:\s*\/\s*\d+)+)/);
    const diametersValue = dMatch?.[1];
    if (diametersValue) {diameters = diametersValue.replace(/\s*\/\s*/g, ';');}
    const pMatch = line.match(/(\d+(?:[.,]\d+)?)/);
    const pressureValue = pMatch?.[1];
    if (pressureValue && l.includes('kg')) {pressure = pressureValue.replace(',', '.');}
  }

  return { type, couplings, diameters, pressure };
}

async function run() {
  const adfIdArg = process.argv[2];
  const logFile = path.join(process.cwd(), '..', 'export_osm.log');
  const oldLogFile = path.join(process.cwd(), '..', 'export_osm_old.log');
  const outputFile = path.join(process.cwd(), '..', 'scripts', 'full_export.osm');

  // Gestió de fitxers de log (rotació)
  if (fs.existsSync(logFile)) {
    if (fs.existsSync(oldLogFile)) {fs.unlinkSync(oldLogFile);}
    fs.renameSync(logFile, oldLogFile);
  }

  const logStream = fs.createWriteStream(logFile, { flags: 'w' });

  await logToFile('--- INICIANT PROCÉS D\'EXPORTACIÓ COMPLETA ---', logStream);

  // 1. Sincronització de baixada (Downstream)
  let allAdfs;
  if (adfIdArg) {
    const adfId = parseInt(adfIdArg);
    allAdfs = db.select().from(adfs).where(eq(adfs.id, adfId)).all();
    if (allAdfs.length === 0) {
      await logToFile(`❌ ADF amb ID ${adfId} no trobada.`, logStream);
      process.exit(1);
    }
          await logToFile(`Pas 1: Sincronitzant dades des d'OSM NOMÉS per a l'ADF ${allAdfs[0]?.nom}...`, logStream);
  } else {
    allAdfs = db.select().from(adfs).all();
    await logToFile(`Pas 1: Sincronitzant dades des d'OSM per a ${allAdfs.length} ADFs...`, logStream);
  }

  for (const adf of allAdfs) {
    try {
      const count = await syncAdfFromOSM(adf.id);
      await logToFile(`  [BAIXADA] ADF ${adf.id} (${adf.nom}): ${count} hidrants sincronitzats.`, logStream);
    } catch (error) {
      await logToFile(`  [ERROR BAIXADA] ADF ${adf.id} (${adf.nom}): ${error instanceof Error ? error.message : error}`, logStream);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 2. Generació del fitxer OSM (Upstream)
  await logToFile('Pas 2: Generant fitxer XML amb NOMÉS els canvis pendents...', logStream);
  
  let allHidrants;
  if (adfIdArg) {
    allHidrants = db.select().from(hidrants).where(eq(hidrants.adf_id, parseInt(adfIdArg))).all();
  } else {
    allHidrants = db.select().from(hidrants).all();
  }
  
  let osmContent = `<?xml version='1.0' encoding='UTF-8'?>\n<osm version='0.6' generator='JOSM'>\n`;
  let newNodeId = -1;
  let changesCount = 0;

  for (const h of allHidrants) {
    // NOMÉS exportem si l'estat no és SYNCED
    if (h.sync_status === 'SYNCED') {continue;}

    changesCount++;
    const id = h.id; // Fem servir el UUID intern per al log
    const osm_id = h.osm_id || 'nou';
    const lat = h.lat;
    const lon = h.lon;
    
    // Determinem l'acció per a JOSM segons l'estat de sincronització
    let actionAttr = "";
    if (h.sync_status === 'PENDING_DELETE') {
      actionAttr = " action='delete'";
    } else if (h.sync_status === 'PENDING_UPDATE') {
      actionAttr = " action='modify'";
    }
    // Per a PENDING_CREATE no cal action si l'id és negatiu, JOSM ja ho interpreta com a nou.

    // Combinar tags
    const osmTags = JSON.parse(h.osm_tags || '{}') as Record<string, string>;
    const serviceTags = JSON.parse(h.service_tags || '{}') as {
      description?: string | { value?: string };
    };
    const parsed = parsePrivateDescription(serviceTags.description);

    const finalTags: Record<string, string> = {
      ...osmTags
    };

    // --- SEGURETAT I NETEJA DE TAGS MUTUAMENT EXCLUSIUS ---
    // Un hidrant no pot ser operatiu (emergency) i estar en desús (disused:emergency) alhora.
    if (finalTags['emergency'] && finalTags['disused:emergency']) {
      await logToFile(`    [CORRECCIÓ] Hidrant ${id}: Tenia tags 'emergency' i 'disused:emergency' simultàniament.`, logStream);
      
      // Lògica de decisió: si hi ha dades de la descripció privada (parsed), ens en fiem.
      // Si no, prioritzem el que sembli més coherent.
      if (parsed.pressure || parsed.couplings) {
        await logToFile(`      Solució: Detectades dades operatives a la descripció. Es manté 'emergency' i s'elimina 'disused'.`, logStream);
        delete finalTags['disused:emergency'];
      } else {
        await logToFile(`      Solució: No s'han detectat dades operatives clares. Es prioritza 'disused' per seguretat.`, logStream);
        delete finalTags['emergency'];
      }
    }

    // Si no té cap tag d'emergència de cap tipus, li posem l'actiu per defecte
    if (!finalTags['emergency'] && !finalTags['disused:emergency'] && !finalTags['abandoned:emergency']) {
      finalTags['emergency'] = 'fire_hydrant';
    }

    await logToFile(`  [HIDRANT] ID: ${id} (OSM: ${osm_id}) - Estat: ${h.sync_status}`, logStream);

    if (parsed.type && finalTags['fire_hydrant:type'] !== parsed.type) {
      const old = finalTags['fire_hydrant:type'] || 'buit';
      await logToFile(`    [CANVI] Tipus: ${old} -> ${parsed.type}`, logStream);
      finalTags['fire_hydrant:type'] = parsed.type;
    }
    if (parsed.couplings && finalTags['fire_hydrant:couplings'] !== parsed.couplings) {
      const old = finalTags['fire_hydrant:couplings'] || 'buit';
      await logToFile(`    [CANVI] Ràcords: ${old} -> ${parsed.couplings}`, logStream);
      finalTags['fire_hydrant:couplings'] = parsed.couplings;
    }
    if (parsed.diameters && finalTags['fire_hydrant:couplings:diameters'] !== parsed.diameters) {
      const old = finalTags['fire_hydrant:couplings:diameters'] || 'buit';
      await logToFile(`    [CANVI] Diàmetres: ${old} -> ${parsed.diameters}`, logStream);
      finalTags['fire_hydrant:couplings:diameters'] = parsed.diameters;
    }
    if (parsed.pressure && finalTags['fire_hydrant:pressure'] !== parsed.pressure) {
      const old = finalTags['fire_hydrant:pressure'] || 'buit';
      await logToFile(`    [CANVI] Pressió: ${old} -> ${parsed.pressure}`, logStream);
      finalTags['fire_hydrant:pressure'] = parsed.pressure;
    }

    // Si detectem que era un hidrant en desús però tenim dades noves
    if (finalTags['disused:emergency'] === 'fire_hydrant' && !finalTags['emergency']) {
      await logToFile(`    [ALERTA] Està marcat com a 'disused' a OSM.`, logStream);
    }

    const xmlNodeId = h.osm_id || newNodeId--;
    const versionAttr = h.osm_id ? ` version='${h.osm_version || 1}'` : "";
    osmContent += `  <node id='${xmlNodeId}'${versionAttr} visible='true' lat='${lat}' lon='${lon}'${actionAttr}>\n`;

    for (const [k, v] of Object.entries(finalTags)) {
      if (v !== null && v !== undefined && v !== '') {
        osmContent += `    <tag k='${escapeXml(k)}' v='${escapeXml(v)}' />\n`;
      }
    }
    osmContent += `  </node>\n`;
  }

  osmContent += `</osm>`;
  
  if (changesCount === 0) {
    await logToFile('ℹ️ No s\'ha detectat cap canvi pendent (tots els hidrants estan SYNCED).', logStream);
  }

  fs.writeFileSync(outputFile, osmContent, 'utf8');
  await logToFile(`✅ PROCÉS FINALITZAT. S'han exportat ${changesCount} canvis.`, logStream);
  await logToFile(`📄 Log detallat a: ${logFile}`, logStream);
  
  logStream.end();
}

await run();
