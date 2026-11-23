import { db } from "../db/index.js";
import { adfs, hidrants } from "../db/schema.js";
import { eq, notInArray, and } from "drizzle-orm";
import { queryOverpass, type OsmElement } from "./overpass.js";
import { randomUUID } from "node:crypto";
import { HidrantsRepository } from "../db/repositories/hidrantsRepository.js";
import { logger } from "../utils/logger.js";

const log = logger.child({ module: "osm", operation: "sync" });

/**
 * Sincronitza els hidrants d'una ADF des d'OpenStreetMap (Overpass).
 *
 * @param force Si és true, sobreescriu tot (comportament original).
 *              Si és false (per defecte), respecta els estats locals:
 *              - SYNCED → actualitza des d'OSM
 *              - PENDING_CREATE → no toca
 *              - PENDING_UPDATE/DELETE → no toca si local és més nou;
 *                sinó marca CONFLICT (no sobreescriure)
 *              - CONFLICT/ERROR/REVIEW → no toca
 */
export async function syncAdfFromOSM(adfId: number, force = false) {
  const startTime = Date.now();
  log.info({ adfId, force }, "Iniciant pull sync per ADF");

  const adf = db.select().from(adfs).where(eq(adfs.id, adfId)).get();

  if (!adf) {
    log.error({ adfId }, "ADF no trobat");
    throw new Error(`ADF ${adfId} not found in database.`);
  }

  const relations = JSON.parse(adf.osm_relations) as string[];

  log.info(
    {
      adfId,
      nom: adf.nom,
      osmRelations: relations.length,
      relations,
    },
    "Relacions OSM per ADF",
  );
  let allElements: OsmElement[] = [];
  let successCount = 0;

  for (const rel of relations) {
    const osmId = rel.replace("R", "");
    const areaId = 3600000000 + Number(osmId);

    const query = `
      [out:json][timeout:90];
      area(${areaId})->.searchArea;
      (
        node(area.searchArea)["emergency"="fire_hydrant"];
        node(area.searchArea)["disused:emergency"="fire_hydrant"];
      );
      out meta;
    `.trim();

    log.debug({ rel, areaId }, "Descarregant dades d'OSM per a relació");
    const result = await queryOverpass(query);

    if (result.ok) {
      successCount++;
      allElements = [...allElements, ...(result.data.elements || [])];
    } else {
      log.error({ rel, err: result.error }, "Error descarregant relació Overpass");
    }
  }

  if (relations.length > 0 && successCount === 0) {
    throw new Error(
      `Totes les consultes a Overpass han fallat per a l'ADF ${adf.nom}. S'atura la sincronització per evitar pèrdua de dades.`,
    );
  }

  // Eliminem duplicats per id de node d'OSM si n'hi ha
  const uniqueElements = Array.from(new Map(allElements.map((node) => [node.id, node])).values());

  log.info({ adfId, count: uniqueElements.length, force }, "Rebuts hidrants d'OSM (únics)");

  const syncTimestamp = new Date().toISOString();

  let skippedCount = 0;
  let conflictCount = 0;

  db.transaction((tx) => {
    for (const node of uniqueElements) {
      // 1. Busquem si ja existeix per osm_id
      const existing = HidrantsRepository.findByOsmId(node.id);

      if (existing) {
        // Guardar les dades remotes d'OSM per al diff (per TOTS els estats amb coincidència OSM)
        HidrantsRepository.saveRemoteData(existing.id, node.lat, node.lon, node.tags || {});
      }

      if (existing && !force) {
        const status = existing.sync_status;

        // Si és SYNCED → actualitzar normalment (ciclo inferior)
        // Si havia desaparegut d'OSM i hi torna → es restaura com a SYNCED
        if (status === "SYNCED" || status === "MISSING_IN_OSM") {
          // cau al cicle inferior d'inserció/actualització
        } else {
          // Qualsevol altre estat local → no sobreescriure locals

          if (status === "PENDING_UPDATE" || status === "PENDING_DELETE") {
            // Comparar timestamps per decidir si hi ha conflicte
            const localTime = new Date(existing.updated_at || 0).getTime();
            const osmTime = new Date(node.timestamp || 0).getTime();

            if (osmTime > localTime) {
              // OSM és més nou → marcar CONFLICT (l'usuari ha de resoldre)
              log.warn(
                {
                  hydrantId: existing.id,
                  osmId: node.id,
                  osmVersion: node.version,
                  localVersion: existing.osm_version,
                  osmTimestamp: node.timestamp,
                  localTimestamp: existing.updated_at,
                },
                "Conflicte detectat (OSM més nou)",
              );
              HidrantsRepository.markConflict(existing.id, {
                localVersion: existing.osm_version,
                osmVersion: node.version,
                osmLat: node.lat,
                osmLon: node.lon,
                osmTags: node.tags,
                localLat: existing.lat,
                localLon: existing.lon,
                localTags: existing.osm_tags ? JSON.parse(existing.osm_tags) : {},
                diffFields: ["pull_sync_conflict"],
              });
              conflictCount++;
            } else {
              // Local és més nou o igual → saltar, mantenir estat local
              log.info(
                {
                  hydrantId: existing.id,
                  osmId: node.id,
                  osmVersion: node.version,
                  localVersion: existing.osm_version,
                },
                "Saltant hidrant (local més nou)",
              );
              skippedCount++;
            }
          } else {
            // PENDING_CREATE, CONFLICT, ERROR, REVIEW → saltar
            log.debug({ osmId: node.id, status }, "Saltant hidrant per estat local existent");
            skippedCount++;
          }
          continue; // No processem aquest node
        }
      }

      // Per force=true, el remote ja es va guardar al principi
      // (si existing existeix, saveRemoteData ja s'ha cridat)

      // FORAT CONEGUT: la coincidència amb el que tenim és només per osm_id. Si algú ha
      // creat un hidrant local (PENDING_CREATE) exactament on OSM ja en té un, aquí
      // s'insereix una fila nova i en queden dos marcadors quasi superposats; publicar
      // el pendent crearia un node duplicat a OSM. Per això els canvis es validen a mà
      // abans de pujar-los (vegeu el panell OSM → «Canvis pendents»).
      const id = existing ? existing.id : randomUUID();

      tx.insert(hidrants)
        .values({
          id,
          osm_id: node.id,
          osm_version: node.version,
          adf_id: adfId,
          lat: node.lat,
          lon: node.lon,
          osm_tags: JSON.stringify(node.tags || {}),
          sync_status: "SYNCED",
          synced_at: syncTimestamp,
          updated_at: syncTimestamp,
        })
        .onConflictDoUpdate({
          target: hidrants.id,
          set: {
            osm_id: node.id,
            lat: node.lat,
            lon: node.lon,
            osm_version: node.version,
            osm_tags: JSON.stringify(node.tags || {}),
            sync_status: "SYNCED",
            synced_at: syncTimestamp,
            updated_at: syncTimestamp,
          },
        })
        .run();
    }

    // Hidrants que ja no són a OSM: NO s'esborren. Es marquen com a MISSING_IN_OSM i
    // es conserven amb totes les seves dades locals (private_tags inclosos) fins que
    // un admin els purgui des del panell OSM. Així un pull erroni, una resposta
    // parcial d'Overpass o una relació mal configurada no destrueixen res.
    // NOMÉS es marca si hem pogut consultar TOTES les relacions de l'ADF amb èxit.
    if (successCount === relations.length) {
      const currentOsmIds = uniqueElements.map((n) => n.id);

      const missingCondition =
        currentOsmIds.length > 0
          ? and(
              eq(hidrants.adf_id, adfId),
              eq(hidrants.sync_status, "SYNCED"),
              notInArray(hidrants.osm_id, currentOsmIds as number[]),
            )
          : and(eq(hidrants.adf_id, adfId), eq(hidrants.sync_status, "SYNCED"));

      const marked = tx
        .update(hidrants)
        .set({ sync_status: "MISSING_IN_OSM", updated_at: syncTimestamp })
        .where(missingCondition)
        .run().changes;

      log.warn(
        {
          adfId,
          markedMissing: marked,
          syncedRelations: successCount,
          totalRelations: relations.length,
          currentOsmIds: currentOsmIds.length,
        },
        "Hidrants que ja no són a OSM: marcats com a MISSING_IN_OSM (no esborrats)",
      );
    } else {
      log.warn(
        { adfId, successCount, totalRelations: relations.length },
        "Saltant detecció d'hidrants que ja no són a OSM per errors en relacions",
      );
    }
  });

  if (skippedCount > 0 || conflictCount > 0) {
    log.info({ skippedCount, conflictCount, adfId }, "Resum sincronització OSM");
  }

  log.info(
    {
      adfId,
      totalElements: allElements.length,
      skipped: skippedCount,
      conflicts: conflictCount,
      duration: Date.now() - startTime,
    },
    "Pull completat",
  );

  return { total: allElements.length, skipped: skippedCount, conflicts: conflictCount };
}
