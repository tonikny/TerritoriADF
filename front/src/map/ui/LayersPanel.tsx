import { useEffect, useRef, useState } from "react";
import { BASEMAPS } from "@/map/shared/basemaps";
import type { TechnicalLayer } from "@/map/shared/overlays";
import { floatingButtonClass } from "@/styles/uiStyles";

type Props = {
  baseLayerId: string;
  onBaseLayerChange: (id: string) => void;
  technicalLayers: TechnicalLayer[];
  activeTechnicalLayer: string | null;
  onTechnicalLayerChange: (id: string | null) => void;
  hidrantsVisible: boolean;
  onHidrantsVisibleChange: (visible: boolean) => void;
  incidenciesVisible: boolean;
  onIncidenciesVisibleChange: (visible: boolean) => void;
  trackingVisible: boolean;
  onTrackingVisibleChange: (visible: boolean) => void;
  canTrack: boolean;
  terrainEnabled: boolean;
  onTerrainEnabledChange: (enabled: boolean) => void;
  terrainX2: boolean;
  onTerrainX2Change: (enabled: boolean) => void;
  canTerrain: boolean;
};

const rowClass = "flex items-center gap-2 py-0.5 cursor-pointer";
const legendClass = "text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted mb-1";

export function LayersPanel({
  baseLayerId,
  onBaseLayerChange,
  technicalLayers,
  activeTechnicalLayer,
  onTechnicalLayerChange,
  hidrantsVisible,
  onHidrantsVisibleChange,
  incidenciesVisible,
  onIncidenciesVisibleChange,
  trackingVisible,
  onTrackingVisibleChange,
  canTrack,
  terrainEnabled,
  onTerrainEnabledChange,
  terrainX2,
  onTerrainX2Change,
  canTerrain,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-end">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={floatingButtonClass}
        title="Capes del mapa"
        aria-label="Capes del mapa"
        aria-expanded={open}
      >
        🗺️
      </button>

      {open && (
        <div className="absolute top-full right-0 z-1000 mt-1 bg-white/95 border border-border rounded shadow-lg p-2 w-60 max-h-[70vh] overflow-y-auto text-[0.8rem]">
          <fieldset className="m-0 p-0 border-0">
            <legend className={legendClass}>Mapa base</legend>
            {BASEMAPS.map((basemap) => (
              <label key={basemap.id} className={rowClass}>
                <input
                  type="radio"
                  name="basemap"
                  checked={baseLayerId === basemap.id}
                  onChange={() => onBaseLayerChange(basemap.id)}
                />
                <span>{basemap.label}</span>
              </label>
            ))}
            {canTerrain && (
              <>
                <div className="my-2 border-t border-soft" />
                <div className="flex items-center gap-2 rounded-md border border-amber-300/70 bg-amber-50/80 py-1.5 pr-2 pl-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={terrainEnabled}
                      onChange={(event) => onTerrainEnabledChange(event.target.checked)}
                      className="accent-amber-600"
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="font-medium">⛰️ Relleu 3D</span>
                      <span className="text-[0.65rem] text-muted">Terreny i ombres</span>
                    </span>
                  </label>
                  <label
                    className={`flex shrink-0 items-center gap-1 ${
                      terrainEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                    }`}
                    title="Duplica l'exageració del relleu"
                  >
                    <input
                      type="checkbox"
                      checked={terrainX2}
                      disabled={!terrainEnabled}
                      onChange={(event) => onTerrainX2Change(event.target.checked)}
                      className="accent-amber-600"
                      aria-label="Duplica l'exageració del relleu"
                    />
                    <span className="text-[0.7rem] font-semibold">x2</span>
                  </label>
                </div>
              </>
            )}
          </fieldset>

          <fieldset className="m-0 mt-2 p-0 border-0 border-t border-soft pt-2">
            <legend className={legendClass}>Superposicions</legend>
            {technicalLayers.map((layer) => (
              <label key={layer.id} className={rowClass}>
                <input
                  type="checkbox"
                  checked={activeTechnicalLayer === layer.id}
                  onChange={(event) =>
                    onTechnicalLayerChange(event.target.checked ? layer.id : null)
                  }
                />
                <span>{layer.label}</span>
              </label>
            ))}

            <div className="my-1 border-t border-soft" />

            <label className={rowClass}>
              <input
                type="checkbox"
                checked={hidrantsVisible}
                onChange={(event) => onHidrantsVisibleChange(event.target.checked)}
              />
              <span>Hidrants</span>
            </label>
            <label className={rowClass}>
              <input
                type="checkbox"
                checked={incidenciesVisible}
                onChange={(event) => onIncidenciesVisibleChange(event.target.checked)}
              />
              <span>Incidències</span>
            </label>
            {canTrack && (
              <label className={rowClass}>
                <input
                  type="checkbox"
                  checked={trackingVisible}
                  onChange={(event) => onTrackingVisibleChange(event.target.checked)}
                />
                <span>Posicions OwnTracks</span>
              </label>
            )}
          </fieldset>
        </div>
      )}
    </div>
  );
}
