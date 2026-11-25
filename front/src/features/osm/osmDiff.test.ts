import { describe, expect, it } from "vitest";

import { buildDiffFromConflict, diffFromBackend, diffRows } from "./osmDiff";

describe("osmDiff", () => {
  it("només accepta el diff d'un conflicte amb les dues bandes", () => {
    expect(buildDiffFromConflict(null)).toBeNull();
    expect(buildDiffFromConflict({ kind: "error", message: "x" })).toBeNull();
    expect(
      buildDiffFromConflict({
        kind: "conflict",
        localTags: { amenity: "fire_hydrant" },
        osmTags: { amenity: "fire_hydrant" },
        localLat: 41.5,
        localLon: 1.9,
      }),
    ).toEqual({
      localTags: { amenity: "fire_hydrant" },
      osmTags: { amenity: "fire_hydrant" },
      localLat: 41.5,
      localLon: 1.9,
      osmLat: undefined,
      osmLon: undefined,
    });
  });

  it("mapeja la resposta del backend (local = osmTags, remot = remoteOsmTags)", () => {
    expect(
      diffFromBackend({
        osmTags: { a: "1" },
        remoteOsmTags: { a: "2" },
        localLat: 1,
        localLon: 2,
        remoteLat: 3,
        remoteLon: 4,
      }),
    ).toEqual({
      localTags: { a: "1" },
      osmTags: { a: "2" },
      localLat: 1,
      localLon: 2,
      osmLat: 3,
      osmLon: 4,
    });
  });

  it("descarta les etiquetes iguals i marca les absents com a buides", () => {
    const rows = diffRows({
      localTags: { igual: "x", canviat: "nou", nomésLocal: "v" },
      osmTags: { igual: "x", canviat: "vell" },
    });

    expect(rows).toEqual([
      { key: "canviat", local: "nou", osm: "vell" },
      { key: "nomésLocal", local: "v", osm: "(buit)" },
    ]);
  });
});
