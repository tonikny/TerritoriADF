import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveEngine } from "./engineSelection";
import { storageKey } from "@/utils/storageKeys";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveEngine", () => {
  it("amb WebGL2 tria MapLibre per defecte", () => {
    expect(resolveEngine("auto", true)).toBe("maplibre");
  });

  it("sense WebGL2 cau a Leaflet", () => {
    expect(resolveEngine("auto", false)).toBe("leaflet");
    expect(resolveEngine("maplibre", false)).toBe("leaflet");
  });

  it("respecta l'override explícit de Leaflet", () => {
    expect(resolveEngine("leaflet", true)).toBe("leaflet");
  });

  it("permet forçar MapLibre si hi ha WebGL2", () => {
    expect(resolveEngine("maplibre", true)).toBe("maplibre");
  });

  it("un ?engine= explícit guanya el fallback de sessió", () => {
    vi.stubGlobal("window", { location: { search: "?engine=maplibre" } });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => (key === storageKey("map_engine_fallback") ? "1" : null),
      setItem: () => {},
      removeItem: () => {},
    });
    expect(resolveEngine(undefined, true)).toBe("maplibre");
  });
});
