import * as xml from "xmlbuilder2";
import { APP_NAME } from "../utils/appInfo.js";

/**
 * Escapar caràcters XML especials.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generar XML per crear un changeset obert.
 *
 * Les dades d'hidrants provenen del treball de camp de les ADF, per això tots
 * els changesets es marquen amb `source=survey`.
 */
export function buildChangesetXml(comment: string): string {
  const doc = xml
    .create({ version: "1.0", encoding: "UTF-8" })
    .ele("osm", { version: "0.6" })
    .ele("changeset")
    .ele("tag", { k: "comment", v: comment })
    .up()
    .ele("tag", { k: "created_by", v: `${APP_NAME}/1.0` })
    .up()
    .ele("tag", { k: "source", v: "survey" })
    .up()
    .up()
    .up();

  return doc.end({ prettyPrint: false });
}

/**
 * Generar XML per crear un node nou (sense id ni version, els assigna OSM).
 */
export function buildNodeCreateXml(
  lat: number,
  lon: number,
  tags: Record<string, string>,
  changesetId: number,
): string {
  const doc = xml
    .create({ version: "1.0", encoding: "UTF-8" })
    .ele("osm", { version: "0.6" })
    .ele("node", {
      lat: String(lat),
      lon: String(lon),
      changeset: String(changesetId),
    });

  for (const [k, v] of Object.entries(tags)) {
    if (v !== null && v !== undefined && v !== "") {
      doc.ele("tag", { k: esc(k), v: esc(v) }).up();
    }
  }

  doc.up().up();
  return doc.end({ prettyPrint: false });
}

/**
 * Generar XML per actualitzar un node existent (amb id i version).
 */
export function buildNodeUpdateXml(
  osmId: number,
  version: number,
  lat: number,
  lon: number,
  tags: Record<string, string>,
  changesetId: number,
): string {
  const doc = xml
    .create({ version: "1.0", encoding: "UTF-8" })
    .ele("osm", { version: "0.6" })
    .ele("node", {
      id: String(osmId),
      version: String(version),
      lat: String(lat),
      lon: String(lon),
      changeset: String(changesetId),
    });

  for (const [k, v] of Object.entries(tags)) {
    if (v !== null && v !== undefined && v !== "") {
      doc.ele("tag", { k: esc(k), v: esc(v) }).up();
    }
  }

  doc.up().up();
  return doc.end({ prettyPrint: false });
}

/**
 * Generar XML per esborrar un node (només id, version i changeset).
 */
export function buildNodeDeleteXml(osmId: number, version: number, changesetId: number): string {
  const doc = xml
    .create({ version: "1.0", encoding: "UTF-8" })
    .ele("osm", { version: "0.6" })
    .ele("node", {
      id: String(osmId),
      version: String(version),
      changeset: String(changesetId),
    })
    .up()
    .up();

  return doc.end({ prettyPrint: false });
}

/**
 * Generar fitxer OSC (OSM Change) amb múltiples operacions.
 * Utilitzat per exportar conflictes per resoldre a JOSM.
 */
export function buildOscXml(
  operations: Array<{
    action: "create" | "modify" | "delete";
    osmId?: number;
    version?: number;
    lat: number;
    lon: number;
    tags: Record<string, string>;
    changesetId: number;
  }>,
): string {
  const doc = xml
    .create({ version: "1.0", encoding: "UTF-8" })
    .ele("osmChange", { version: "0.6", generator: APP_NAME });

  for (const op of operations) {
    const actionEle = doc.ele(
      op.action === "create" ? "create" : op.action === "modify" ? "modify" : "delete",
    );

    const attrs: Record<string, string> = {
      lat: String(op.lat),
      lon: String(op.lon),
      changeset: String(op.changesetId),
    };

    if (op.osmId !== undefined) {
      attrs.id = String(op.osmId);
    }
    if (op.version !== undefined) {
      attrs.version = String(op.version);
    }

    const nodeEle = actionEle.ele("node", attrs);

    if (op.action !== "delete") {
      for (const [k, v] of Object.entries(op.tags)) {
        if (v !== null && v !== undefined && v !== "") {
          nodeEle.ele("tag", { k: esc(k), v: esc(v) }).up();
        }
      }
    }

    nodeEle.up();
    actionEle.up();
  }

  doc.up();
  return doc.end({ prettyPrint: true });
}
