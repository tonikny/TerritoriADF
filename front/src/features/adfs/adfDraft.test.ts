import { describe, expect, it } from "vitest";

import { boundaryAreaKm2, draftFrom, osmRelationUrl, parseRelations } from "./adfDraft";

describe("adfDraft", () => {
  it("normalitza les relacions escrites a mà", () => {
    expect(parseRelations("R345695, 345699")).toEqual(["R345695", "R345699"]);
    expect(parseRelations("r1; W2\n3 3")).toEqual(["R1", "W2", "R3"]);
    expect(parseRelations("   ")).toEqual([]);
  });

  it("enllaça relacions, ways i nodes d'OSM", () => {
    expect(osmRelationUrl("R123")).toBe("https://www.openstreetmap.org/relation/123");
    expect(osmRelationUrl("W7")).toBe("https://www.openstreetmap.org/way/7");
    expect(osmRelationUrl("N9")).toBe("https://www.openstreetmap.org/node/9");
    expect(osmRelationUrl("X1")).toBeNull();
  });

  it("passa les dades d'una ADF al formulari d'edició", () => {
    expect(draftFrom({ id: 278, nom: "Berguedà", osm_relations: ["R1", "R2"] })).toEqual({
      numero: "278",
      nom: "Berguedà",
      relations: "R1, R2",
    });
  });

  it("retorna null si la frontera no existeix o no és un GeoJSON", () => {
    expect(boundaryAreaKm2(null)).toBeNull();
    expect(boundaryAreaKm2("{no és json")).toBeNull();
  });
});
