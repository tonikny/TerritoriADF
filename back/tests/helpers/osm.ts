import fs from "node:fs";
import path from "node:path";

import type { OsmElement, OverpassResult } from "../../src/services/overpass.js";

const FIXTURES_DIR = path.resolve(import.meta.dirname, "../fixtures");

interface OverpassFixture {
  elements?: OsmElement[];
}

/** Contingut cru d'una resposta d'Overpass desada a `tests/fixtures/`. */
export function overpassFixtureData(name: string): OverpassFixture {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8");
  return JSON.parse(raw) as OverpassFixture;
}

/** Mateixa fixture, amb la forma que retorna `queryOverpass()`. */
export function overpassResult(name: string): OverpassResult {
  return { ok: true, status: 200, data: overpassFixtureData(name) };
}
