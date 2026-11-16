import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  bboxToBounds,
  clampToMaxDistance,
  distanceMeters,
  viewForAdf,
} from "./geometry";

describe("bboxToBounds", () => {
  it("converteix [minLat, minLon, maxLat, maxLon] a punts cardinals", () => {
    expect(bboxToBounds([41.5, 1.6, 41.7, 1.9])).toEqual({
      south: 41.5,
      west: 1.6,
      north: 41.7,
      east: 1.9,
    });
  });
});

describe("distanceMeters", () => {
  it("dona ~111 km per un grau de latitud", () => {
    expect(distanceMeters({ lat: 41, lon: 2 }, { lat: 42, lon: 2 })).toBeCloseTo(111_195, -2);
  });
});

describe("clampToMaxDistance", () => {
  const origin = { lat: 41.6, lon: 1.7 };

  it("deixa passar el destí si és dins del radi", () => {
    const target = { lat: 41.6001, lon: 1.7001 };
    expect(clampToMaxDistance(origin, target, 50)).toEqual(target);
  });

  it("retalla el destí al radi màxim", () => {
    const target = { lat: 41.7, lon: 1.7 };
    const clamped = clampToMaxDistance(origin, target, 50);
    expect(distanceMeters(origin, clamped)).toBeCloseTo(50, 1);
    expect(clamped.lat).toBeGreaterThan(origin.lat);
    expect(clamped.lat).toBeLessThan(target.lat);
  });
});

describe("viewForAdf", () => {
  it("centra i fixa zoom 14 quan hi ha centre", () => {
    expect(viewForAdf({ bbox: null, center: [41.6, 1.7] })).toEqual({
      center: { lat: 41.6, lon: 1.7 },
      zoom: 14,
    });
  });

  it("cau a la vista per defecte sense ADF", () => {
    expect(viewForAdf(null)).toEqual(DEFAULT_VIEW);
  });
});
