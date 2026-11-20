import { describe, expect, it } from "vitest";

import { validateHydrantTags } from "../src/services/osmDataValidator.js";
import { computeDiffData, computeDiffStrings } from "../src/services/osmDiff.js";

describe("validateHydrantTags", () => {
  it("accepta un hidrant amb tots els tags gestionats correctes", () => {
    const result = validateHydrantTags({
      "fire_hydrant:type": "pillar",
      "fire_hydrant:position": "lane",
      couplings: "2",
      "couplings:diameters": "70 mm; 100 mm",
      "fire_hydrant:pressure": "3",
      "survey:date": "2026-01-15",
      "addr:street": "Carrer Vell",
      "addr:housenumber": "5",
      "addr:neighbourhood": "Centre",
      emergency: "fire_hydrant",
    });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("marca com a error un tipus fora de la llista", () => {
    const result = validateHydrantTags({ "fire_hydrant:type": "fountain" });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ tag: "fire_hydrant:type", level: "error" }),
    );
  });

  it("marca com a error una posició, un nombre d'acoblaments i una data invàlids", () => {
    const result = validateHydrantTags({
      "fire_hydrant:position": "sky",
      couplings: "9",
      "survey:date": "15/01/2026",
    });

    expect(result.valid).toBe(false);
    expect(result.issues.filter((issue) => issue.level === "error")).toHaveLength(3);
  });

  it("un diàmetre no estàndard només genera un warning", () => {
    const result = validateHydrantTags({ "couplings:diameters": "80 mm" });

    expect(result.valid).toBe(true);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ tag: "couplings:diameters", level: "warning" }),
    );
  });

  it("accepta qualsevol format de pressió (OSM també fa servir valors textuals)", () => {
    const result = validateHydrantTags({ "fire_hydrant:pressure": "low" });

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("detecta text tot en majúscules", () => {
    const result = validateHydrantTags({ "addr:street": "CARRER GRAN" });

    expect(result.valid).toBe(true);
    expect(result.issues.some((issue) => issue.level === "warning")).toBe(true);
  });

  it("rebutja valors i claus de més de 255 caràcters", () => {
    const longValue = "x".repeat(256);
    const result = validateHydrantTags({ "addr:street": longValue, [longValue]: "v" });

    expect(result.valid).toBe(false);
    expect(result.issues.filter((issue) => issue.level === "error")).toHaveLength(2);
  });
});

describe("osmDiff", () => {
  const tags = { "addr:street": "Carrer Vell", emergency: "fire_hydrant" };

  it("no retorna diferències si coordenades i tags coincideixen", () => {
    const diffs = computeDiffStrings(41.6, 1.6, tags, 41.6, 1.6, { ...tags });

    expect(diffs).toEqual([]);
  });

  it("descriu canvis de posició i de tags", () => {
    const diffs = computeDiffStrings(41.6, 1.6, tags, 41.7, 1.6, {
      ...tags,
      "addr:street": "Carrer Nou",
    });

    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toContain("lat");
    expect(diffs[1]).toContain("addr:street");
  });

  it("retorna l'objecte estructurat per a la UI", () => {
    const data = computeDiffData(41.6, 1.6, tags, 41.7, 1.7, { ...tags });

    expect(data.localLat).toBe(41.6);
    expect(data.remoteLat).toBe(41.7);
    expect(data.osmTags).toEqual(tags);
  });
});
