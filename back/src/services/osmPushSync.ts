import { HidrantsRepository, type HidrantData } from "../db/repositories/hidrantsRepository.js";
import * as osmApi from "./osmApi.js";
import { sendTelegramMessage } from "../utils/telegram.js";
import { tryAutoResolve, type ConflictDetail } from "./osmConflictResolver.js";
import { validateHydrantTags } from "./osmDataValidator.js";
import { computeDiffStrings } from "./osmDiff.js";
import { logger } from "../utils/logger.js";
import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { inArray } from "drizzle-orm";

const log = logger.child({ module: "osm", operation: "push" });

export type PushSyncResult = {
  synced: number;
  conflicts: number;
  errors: number;
  reviewed: number;
  details: Array<{
    id: string;
    osmId: number | null;
    status: "synced" | "conflict" | "error" | "review";
    message?: string;
  }>;
};

export function parseOsmTags(osmTags: string | null | undefined): Record<string, string> {
  try {
    return JSON.parse(osmTags || "{}");
  } catch {
    return {};
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Noms de les ADF afectades pel push, per identificar l'origen de les dades.
 */
function affectedAdfNames(pending: HidrantData[]): string[] {
  const ids = [
    ...new Set(pending.map((h) => h.adf_id).filter((id): id is number => typeof id === "number")),
  ];
  if (ids.length === 0) {
    return [];
  }
  return db
    .select({ nom: adfs.nom })
    .from(adfs)
    .where(inArray(adfs.id, ids))
    .all()
    .map((row) => row.nom);
}

/**
 * Comentari del changeset. OSM el mostra com el registre públic de l'edició,
 * així que hi indiquem què s'ha fet i per a quines ADF.
 */
export function buildChangesetComment(pending: HidrantData[]): string {
  let creates = 0;
  let updates = 0;
  let deletes = 0;

  for (const h of pending) {
    if (h.sync_status === "PENDING_DELETE") {
      deletes++;
    } else if (h.sync_status === "PENDING_CREATE" || (h.sync_status === "ERROR" && !h.osm_id)) {
      // Els ERROR sense osm_id es reintenten com a creació.
      creates++;
    } else {
      updates++;
    }
  }

  const actions: string[] = [];
  if (creates > 0) {
    actions.push(plural(creates, "alta", "altes"));
  }
  if (updates > 0) {
    actions.push(plural(updates, "actualització", "actualitzacions"));
  }
  if (deletes > 0) {
    actions.push(plural(deletes, "esborrat", "esborrats"));
  }

  const adfNames = affectedAdfNames(pending);
  const scope = adfNames.length > 0 ? ` (${adfNames.join(", ")})` : "";

  return `TerritoriADF: Hidrants d'incendis${scope}: ${actions.join(", ")}`;
}

/**
 * Sincronitzar els canvis pendents de la BD cap a OSM (push sync).
 *
 * FLUX:
 * 1. Obtenir hidrants PENDING_CREATE / PENDING_UPDATE / PENDING_DELETE
 * 2. Crear un únic changeset
 * 3. Per cada hidrant, intentar publicar amb la seva osm_version
 * 4. Si 200 → SYNCED + actualitzar osm_version
 * 5. Si 409 → CONFLICT (guardar detalls per al .osc)
 * 6. Tancar changeset
 * 7. Notificar a l'admin via Telegram si hi ha conflictes
 */
export async function pushSyncToOSM(options?: {
  ids?: string[];
  adfId?: number;
}): Promise<PushSyncResult> {
  const startTime = Date.now();
  log.info({ ...options }, "Iniciant push sync");

  if (!osmApi.isConfigured()) {
    throw new Error("Token OSM no configurat. Afegeix OSM_ACCESS_TOKEN a back/.env");
  }

  let pending: HidrantData[];

  if (options?.ids && options.ids.length > 0) {
    // Push selectiu: només els IDs especificats. S'hi inclouen els ERROR perquè
    // el botó "Reintentar" del panell OSM pugui reintentar hidrants que van
    // quedar bloquejats per una validació (p. ex. pressió no numèrica).
    pending = HidrantsRepository.findByIds(options.ids).filter(
      (h) =>
        h.sync_status === "PENDING_CREATE" ||
        h.sync_status === "PENDING_UPDATE" ||
        h.sync_status === "PENDING_DELETE" ||
        h.sync_status === "ERROR",
    );
  } else {
    // Push global: tots els pending
    pending = HidrantsRepository.findBySyncStatus([
      "PENDING_CREATE",
      "PENDING_UPDATE",
      "PENDING_DELETE",
    ]);
    // Filtrar per ADF si es demana
    if (options?.adfId) {
      pending = pending.filter((h) => h.adf_id === options.adfId);
    }
  }

  if (pending.length === 0) {
    return { synced: 0, conflicts: 0, errors: 0, reviewed: 0, details: [] };
  }

  log.info({ count: pending.length }, "Canvis pendents de pujar a OSM");

  // Crear changeset
  const changesetComment = buildChangesetComment(pending);
  const changesetId = await osmApi.createChangeset(changesetComment);
  log.info({ changesetId, changesetComment }, "Changeset OSM creat");

  const result: PushSyncResult = { synced: 0, conflicts: 0, errors: 0, reviewed: 0, details: [] };
  const conflictDetails: ConflictDetail[] = [];

  for (const h of pending) {
    try {
      if (h.sync_status === "PENDING_CREATE") {
        await processCreate(h, changesetId, result);
      } else if (h.sync_status === "PENDING_UPDATE") {
        await processUpdate(h, changesetId, result, conflictDetails);
      } else if (h.sync_status === "PENDING_DELETE") {
        await processDelete(h, changesetId, result, conflictDetails);
      } else if (h.sync_status === "ERROR") {
        // Reintent d'un hidrant que va quedar bloquejat: si mai s'ha publicat,
        // es crea; si ja existeix a OSM, s'actualitza.
        if (h.osm_id) {
          await processUpdate(h, changesetId, result, conflictDetails);
        } else {
          await processCreate(h, changesetId, result);
        }
      }
    } catch (err) {
      log.error({ err, hydrantId: h.id }, "Error processant hidrant a OSM push");
      HidrantsRepository.markError(h.id, String(err));
      result.errors++;
      result.details.push({
        id: h.id,
        osmId: h.osm_id ?? null,
        status: "error",
        message: String(err),
      });
    }
  }

  // Tancar changeset
  await osmApi.closeChangeset(changesetId);
  log.info({ changesetId }, "Changeset OSM tancat");

  // Notificar conflictes per Telegram
  if (conflictDetails.length > 0) {
    log.info(
      {
        conflictCount: conflictDetails.length,
        firstConflicts: conflictDetails.slice(0, 2).map((c) => ({
          hidrantId: c.hidrant.id,
          osmVersion: c.osmVersion,
        })),
      },
      "Notificant conflictes via Telegram",
    );
    await notifyConflicts(conflictDetails);
  } else {
    log.info("No hi ha conflictes per notificar");
  }

  log.info(
    {
      duration: Date.now() - startTime,
      synced: result.synced,
      conflicts: result.conflicts,
      reviewed: result.reviewed,
      errors: result.errors,
    },
    "Push completat",
  );

  return result;
}

// --- Processament individual ---

async function processCreate(h: HidrantData, changesetId: number, result: PushSyncResult) {
  const tags = parseOsmTags(h.osm_tags);
  log.info(
    { hydrantId: h.id, tagsCount: Object.keys(tags).length, changesetId },
    "Processant creació",
  );

  // Validar dades abans de pujar
  const validation = validateHydrantTags(tags);
  if (!validation.valid) {
    const errorMessages = validation.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("; ");
    log.error("Creació fallida: dades invàlides");
    HidrantsRepository.markError(h.id, `Dades invàlides: ${errorMessages}`);
    result.errors++;
    result.details.push({ id: h.id, osmId: null, status: "error", message: "Dades invàlides" });
    return;
  }
  if (validation.issues.length > 0) {
    log.warn(
      {
        hydrantId: h.id,
        warnings: validation.issues.length,
        issues: validation.issues.slice(0, 2),
      },
      "Creació amb warnings",
    );
    HidrantsRepository.markReview(h.id, validation.issues);
    result.reviewed++;
    result.details.push({
      id: h.id,
      osmId: null,
      status: "review",
      message: `Warnings: ${validation.issues.map((i) => i.message).join("; ")}`,
    });
    return;
  }

  try {
    log.info(
      { hydrantId: h.id, lat: h.lat, lon: h.lon, tags: Object.keys(tags) },
      "Pujant nou node a OSM",
    );
    const { osmId, newVersion } = await osmApi.createNode(h.lat, h.lon, tags, changesetId);
    HidrantsRepository.markSynced(h.id, newVersion, osmId);
    // Guardar les dades que hem pujat com a remote (per al futur diff)
    HidrantsRepository.saveRemoteData(h.id, h.lat, h.lon, tags);
    log.info({ hydrantId: h.id, osmId, newVersion }, "Creació exitosa");
    result.synced++;
    result.details.push({ id: h.id, osmId, status: "synced" });
  } catch (err) {
    log.error("Creació fallida");
    HidrantsRepository.markError(h.id, String(err));
    result.errors++;
    result.details.push({ id: h.id, osmId: null, status: "error", message: String(err) });
  }
}

async function processUpdate(
  h: HidrantData,
  changesetId: number,
  result: PushSyncResult,
  conflictDetails: ConflictDetail[],
) {
  const osmId = h.osm_id;
  const osmVersion = h.osm_version;
  log.info({ hydrantId: h.id, osmId, osmVersion, changesetId }, "Processant actualització");

  if (!osmId || !osmVersion) {
    log.error("Actualització fallida: osm_id o osm_version no definits");
    HidrantsRepository.markError(h.id, "osm_id o osm_version no definits");
    result.errors++;
    result.details.push({
      id: h.id,
      osmId: osmId ?? null,
      status: "error",
      message: "Sense osm_id o osm_version",
    });
    return;
  }

  const tags = parseOsmTags(h.osm_tags);

  // Validar dades abans de pujar
  const validation = validateHydrantTags(tags);
  if (!validation.valid) {
    const errorMessages = validation.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("; ");
    log.error("Actualització fallida: dades invàlides");
    HidrantsRepository.markError(h.id, `Dades invàlides: ${errorMessages}`);
    result.errors++;
    result.details.push({ id: h.id, osmId, status: "error", message: "Dades invàlides" });
    return;
  }
  if (validation.issues.length > 0) {
    log.warn({ hydrantId: h.id, warnings: validation.issues.length }, "Actualització amb warnings");
    HidrantsRepository.markReview(h.id, validation.issues);
    result.reviewed++;
    result.details.push({
      id: h.id,
      osmId,
      status: "review",
      message: `Warnings: ${validation.issues.map((i) => i.message).join("; ")}`,
    });
    return;
  }

  log.info(
    { hydrantId: h.id, osmId, osmVersion, lat: h.lat, lon: h.lon, tags: Object.keys(tags) },
    "Pujant actualització a OSM",
  );

  const r = await osmApi.updateNode(osmId, osmVersion, h.lat, h.lon, tags, changesetId);

  if (r.ok) {
    const newVersion = Number(r.data) || osmVersion + 1;
    HidrantsRepository.markSynced(h.id, newVersion);
    // Guardar les dades que hem pujat com a remote (per al futur diff)
    HidrantsRepository.saveRemoteData(h.id, h.lat, h.lon, tags);
    log.info({ hydrantId: h.id, osmId, newVersion }, "Actualització exitosa");
    result.synced++;
    result.details.push({ id: h.id, osmId, status: "synced" });
  } else if (r.status === 400) {
    log.error("Actualització fallida (400)");
    HidrantsRepository.markError(h.id, r.error);
    result.errors++;
    result.details.push({ id: h.id, osmId, status: "error", message: r.error });
  } else if ("osmVersion" in r) {
    // 409 — Conflicte de versió
    const diffFields = computeDiffStrings(h.lat, h.lon, tags, r.osmLat, r.osmLon, r.osmTags);
    log.warn("Conflicte de versió detectat");

    const errorDetails = {
      localVersion: osmVersion,
      osmVersion: r.osmVersion,
      osmLat: r.osmLat,
      osmLon: r.osmLon,
      osmTags: r.osmTags,
      localLat: h.lat,
      localLon: h.lon,
      localTags: tags,
      diffFields,
    };

    // Guardar les dades remotes per al diff
    HidrantsRepository.saveRemoteData(h.id, r.osmLat, r.osmLon, r.osmTags);

    // Intentar merge automàtic
    const autoMerged = await tryAutoResolve(h);

    if (autoMerged) {
      log.info({ hydrantId: h.id, osmId }, "Conflicte resolt automàticament");
      result.synced++;
      result.details.push({ id: h.id, osmId, status: "synced", message: "Resolt automàticament" });
    } else {
      log.error("Conflicte no resolt");
      HidrantsRepository.markConflict(h.id, errorDetails);
      conflictDetails.push({
        hidrant: h,
        osmVersion: r.osmVersion,
        osmLat: r.osmLat,
        osmLon: r.osmLon,
        osmTags: r.osmTags,
        diffFields,
      });
      result.conflicts++;
      result.details.push({
        id: h.id,
        osmId: h.osm_id ?? null,
        status: "conflict",
        message: `Diferències: ${diffFields.join(", ")}`,
      });
    }
  } else {
    log.error("Actualització fallida");
    HidrantsRepository.markError(h.id, r.error);
    result.errors++;
    result.details.push({ id: h.id, osmId: h.osm_id ?? null, status: "error", message: r.error });
  }
}

async function processDelete(
  h: HidrantData,
  changesetId: number,
  result: PushSyncResult,
  conflictDetails: ConflictDetail[],
) {
  if (!h.osm_id || !h.osm_version) {
    // Node mai publicat a OSM — esborrar directament de la BD
    HidrantsRepository.delete(h.id);
    result.synced++;
    result.details.push({
      id: h.id,
      osmId: null,
      status: "synced",
      message: "Esborrat localment (mai publicat)",
    });
    return;
  }

  const osmId = h.osm_id;
  const osmVersion = h.osm_version;
  const r = await osmApi.deleteNode(osmId, osmVersion, changesetId);

  if (r.ok) {
    HidrantsRepository.delete(h.id);
    result.synced++;
    result.details.push({ id: h.id, osmId, status: "synced", message: "Esborrat d'OSM" });
  } else if ("osmVersion" in r) {
    // 409 — algú ha canviat el node abans d'esborrar-lo
    const diffFields = computeDiffStrings(
      h.lat,
      h.lon,
      parseOsmTags(h.osm_tags),
      r.osmLat,
      r.osmLon,
      r.osmTags,
    );

    // Guardar les dades remotes per al diff
    HidrantsRepository.saveRemoteData(h.id, r.osmLat, r.osmLon, r.osmTags);

    HidrantsRepository.markConflict(h.id, {
      localVersion: osmVersion,
      osmVersion: r.osmVersion,
      osmLat: r.osmLat,
      osmLon: r.osmLon,
      osmTags: r.osmTags,
      localLat: h.lat,
      localLon: h.lon,
      localTags: parseOsmTags(h.osm_tags),
      diffFields,
    });
    conflictDetails.push({
      hidrant: h,
      osmVersion: r.osmVersion,
      osmLat: r.osmLat,
      osmLon: r.osmLon,
      osmTags: r.osmTags,
      diffFields,
    });
    result.conflicts++;
    result.details.push({
      id: h.id,
      osmId,
      status: "conflict",
      message: `Diferències: ${diffFields.join(", ")}`,
    });
  } else {
    HidrantsRepository.markError(h.id, r.error);
    result.errors++;
    result.details.push({ id: h.id, osmId, status: "error", message: r.error });
  }
}

// --- Helpers ---

async function notifyConflicts(conflicts: ConflictDetail[]) {
  let msg = `⚠️ <b>Conflictes OSM detectats</b> (${conflicts.length})\n\n`;

  for (const c of conflicts) {
    const h = c.hidrant;
    const label = h.osm_id ? `OSM ${h.osm_id}` : h.id;
    msg += `• <b>Hidrant ${label}</b>\n`;
    msg += `  Diferències: ${c.diffFields.join(", ")}\n`;
    msg += `  Versió local: ${h.osm_version}, Versió OSM: ${c.osmVersion}\n\n`;
  }

  msg += `Resol-los a l'administració o descarrega el fitxer .osc`;

  await sendTelegramMessage(msg);
}
