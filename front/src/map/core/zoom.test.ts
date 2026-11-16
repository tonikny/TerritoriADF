import { describe, expect, it } from "vitest";
import { toEngineZoom, toNeutralZoom } from "./zoom";

describe("conversió de zoom", () => {
  it("MapLibre va un nivell per sota de la convenció Leaflet", () => {
    expect(toEngineZoom(14)).toBe(13);
    expect(toNeutralZoom(13)).toBe(14);
  });

  it("és reversible", () => {
    for (const zoom of [0, 5, 11, 14, 18, 22]) {
      expect(toNeutralZoom(toEngineZoom(zoom))).toBe(zoom);
    }
  });
});
