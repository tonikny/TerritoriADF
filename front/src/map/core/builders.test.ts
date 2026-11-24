import { describe, expect, it, vi } from "vitest";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import type { Position } from "@territoriadf/contracts/tracking";
import type { Polygon } from "geojson";

import {
  boundaryPolygons,
  createMarker,
  hidrantMarkers,
  incidenciaMarkers,
  routePolylines,
  trackingMarkers,
  userMarker,
} from "./builders";
import { distanceMeters } from "./geometry";

function hidrant(id: string, coordinates: [number, number] = [2.3, 41.5]): HidrantFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates },
    properties: { ui_fields: {} },
  } as unknown as HidrantFeature;
}

function incidencia(id: string): IncidenciaFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [2.3, 41.5] },
    properties: { id, prioritat: "ALTA", tipus: "altre" },
  } as unknown as IncidenciaFeature;
}

function tracked(): Position {
  return {
    lat: 41.5,
    lon: 2.3,
    battery: 80,
    accuracy: 12,
    timestamp: 1_700_000_000,
  } as unknown as Position;
}

describe("hidrantMarkers", () => {
  const base = {
    selectedId: null,
    editingId: null,
    draftPosition: null,
    maxMoveMeters: 25,
    onSelect: vi.fn(),
    onDrag: vi.fn(),
  };

  it("marca els hidrants i només crida onSelect quan no s'arrosseguen", () => {
    const onSelect = vi.fn();
    const markers = hidrantMarkers([hidrant("a"), hidrant("b")], {
      ...base,
      selectedId: "b",
      onSelect,
    });

    expect(markers.map((marker) => marker.id)).toEqual(["hydrant-a", "hydrant-b"]);
    expect(markers[1].selected).toBe(true);
    expect(markers[1].ringClassName).toBe("hydrant-ring");
    expect(markers[0].draggable).toBe(false);
    expect(markers[0].circle).toBeUndefined();

    markers[0].onClick?.();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("només deixa arrossegar el node en edició i en retalla el moviment", () => {
    const onDrag = vi.fn();
    const draft = { lat: 41.5005, lon: 2.3005 };
    const markers = hidrantMarkers([hidrant("a"), hidrant("b")], {
      ...base,
      selectedId: "a",
      editingId: "a",
      draftPosition: draft,
      onDrag,
    });

    expect(markers[0].draggable).toBe(true);
    expect(markers[0].position).toBe(draft);
    expect(markers[0].circle).toEqual({
      radiusMeters: 25,
      color: "#eab308",
      fillOpacity: 0.08,
      weight: 1,
    });
    expect(markers[0].onClick).toBeUndefined();
    expect(markers[1].draggable).toBe(false);

    markers[0].onDragEnd?.({ lat: 42.5, lon: 3.5 });
    expect(onDrag).toHaveBeenCalledTimes(1);
    const [feature, clamped] = onDrag.mock.calls[0] as [
      HidrantFeature,
      { lat: number; lon: number },
    ];
    expect(feature.id).toBe("a");
    // La retallada interpola en lat/lon (error ~0,3 % sobre el radi): es comprova
    // que quedi dins del radi i no a mig camí del destí.
    const distance = distanceMeters({ lat: 41.5, lon: 2.3 }, clamped);
    expect(distance).toBeGreaterThan(24.5);
    expect(distance).toBeLessThan(25.5);
  });

  it("no aplica la posició esborrany si el node no s'està editant", () => {
    const [marker] = hidrantMarkers([hidrant("a")], {
      ...base,
      draftPosition: { lat: 0, lon: 0 },
    });
    expect(marker.position).toEqual({ lat: 41.5, lon: 2.3 });
  });
});

describe("incidenciaMarkers", () => {
  it("afegeix el prefix i l'anell propi de les incidències", () => {
    const onSelect = vi.fn();
    const [marker] = incidenciaMarkers([incidencia("x")], { selectedId: "x", onSelect });

    expect(marker.id).toBe("incidencia-x");
    expect(marker.selected).toBe(true);
    expect(marker.ringClassName).toBe("incidencia-ring");

    marker.onClick?.();
    expect(onSelect).toHaveBeenCalled();
  });
});

describe("trackingMarkers", () => {
  it("converteix cada posició en un marcador amb el popup que li donen", () => {
    const markers = trackingMarkers({ "278/GI/001": tracked() }, (username) => `popup-${username}`);

    expect(markers).toHaveLength(1);
    expect(markers[0].id).toBe("tracking-278/GI/001");
    expect(markers[0].position).toEqual({ lat: 41.5, lon: 2.3 });
    expect(markers[0].zIndex).toBe(10);
    expect(markers[0].popup).toBe("popup-278/GI/001");
  });
});

describe("boundaryPolygons", () => {
  const geometry = { type: "Polygon", coordinates: [] } as unknown as Polygon;

  it("enfosqueix el que queda fora quan no hi ha capa tècnica", () => {
    const polygons = boundaryPolygons(
      { mask: geometry, boundary: geometry },
      { adfId: 278, technicalLayerActive: false },
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0].id).toBe("adf-mask-278");
    expect(polygons[0].style.fillOpacity).toBe(0.6);
  });

  it("dibuixa només la frontera discontínua amb una capa tècnica activa", () => {
    const polygons = boundaryPolygons(
      { mask: geometry, boundary: geometry },
      { adfId: 278, technicalLayerActive: true },
    );
    expect(polygons).toHaveLength(1);
    expect(polygons[0].id).toBe("adf-boundary-278");
    expect(polygons[0].style.dashArray).toBe("5, 10");
  });

  it("no pinta res si encara no hi ha frontera", () => {
    expect(
      boundaryPolygons(
        { mask: null, boundary: null },
        { adfId: null, technicalLayerActive: false },
      ),
    ).toEqual([]);
  });
});

describe("routePolylines", () => {
  it("dibuixa l'ombra i la línia principal amb la durada", () => {
    const lines = routePolylines({
      coordinates: [
        [2, 41],
        [2.1, 41.1],
      ],
      distanceKm: 12.34,
      durationMin: 17.6,
    });

    expect(lines.map((line) => line.id)).toEqual(["route-shadow", "route-main"]);
    expect(lines[1].label?.text).toBe("18 min – 12.3 km");
    expect(routePolylines(null)).toEqual([]);
  });
});

describe("marcadors propis", () => {
  it("pinta la posició pròpia amb el cercle de precisió i el punt de creació", () => {
    const onCreate = vi.fn();
    const mine = userMarker({ lat: 41.5, lon: 2.3 }, 12, onCreate);
    expect(mine.id).toBe("user-position");
    expect(mine.circle?.radiusMeters).toBe(12);
    mine.onClick?.();
    expect(onCreate).toHaveBeenCalled();

    expect(userMarker({ lat: 41.5, lon: 2.3 }, null).circle).toBeUndefined();
    expect(createMarker({ lat: 41.5, lon: 2.3 })).toMatchObject({
      id: "create-position",
      interactive: false,
      zIndex: 30,
    });
  });
});
