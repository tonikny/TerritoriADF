import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BASEMAPS } from "@/map/shared/basemaps";
import type { TechnicalLayer } from "@/map/shared/overlays";
import { floatingButtonClass } from "@/styles/uiStyles";

type Props = {
  /** Icona del botó: la poseu des de la vista, que sí que pot importar `shared/`. */
  buttonIcon: ReactNode;
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

const rowClass = "flex items-center gap-2 py-0.5 leading-tight cursor-pointer";
const legendClass = "text-xs font-semibold uppercase tracking-[0.08em] text-primary mb-0.5";

export function LayersPanel({
  buttonIcon,
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
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // El menú viu en un portal perquè quedi per sobre del bottom sheet: el
  // contenidor de controls (`z-990`) és un context d'apilament i qualsevol
  // z-index de dins seu queda atrapat per sota del full (`z-1000`).
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
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
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) {
            place();
          }
          setOpen((value) => !value);
        }}
        className={floatingButtonClass}
        title="Capes del mapa"
        aria-label="Capes del mapa"
        aria-expanded={open}
      >
        {buttonIcon}
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: anchor.top, right: anchor.right }}
            className="fixed z-1100 bg-white border border-border-strong rounded-lg shadow-panel p-2 w-60 max-h-[70vh] overflow-y-auto text-sm"
          >
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
                  <div className="my-1 border-t border-soft" />
                  <div className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 py-1 pr-1.5 pl-1.5 leading-tight">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={terrainEnabled}
                        onChange={(event) => onTerrainEnabledChange(event.target.checked)}
                        className="accent-warn"
                      />
                      <span className="flex flex-col leading-tight">
                        <span className="font-medium">Relleu 3D</span>
                        <span className="text-xs text-muted">Terreny i ombres</span>
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
                        className="accent-warn"
                        aria-label="Duplica l'exageració del relleu"
                      />
                      <span className="text-xs font-semibold">x2</span>
                    </label>
                  </div>
                </>
              )}
            </fieldset>

            <fieldset className="m-0 mt-1 p-0 border-0 border-t border-soft pt-1.5">
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
          </div>,
          document.body,
        )}
    </div>
  );
}
