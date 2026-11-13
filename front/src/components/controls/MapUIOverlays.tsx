import { FullscreenButton } from "./FullscreenButton";
import { LocateButton } from "./LocateButton";
import { MapLogo } from "./MapLogo";
import { OfflineNotice } from "../shared/OfflineNotice";
import { ZoomDisplay } from "./ZoomDisplay";
import {
  floatingButtonClass,
  controlContainerClass,
  controlItemClass,
} from "../../styles/uiStyles";

interface MapUIOverlaysProps {
  setLocatePosition: (latlng: L.LatLng | null) => void;
  setLocateAccuracy?: (accuracy: number | null) => void;
  loadingHidrants: boolean;
  hidrantsError: string | null;
  /** L'ADF s'ha carregat i no té cap hidrant a la base de dades. */
  emptyHidrants?: boolean;
  /** L'usuari pot baixar hidrants d'OSM (permís sync_osm). */
  canSyncFromOsm?: boolean;
  onDismissEmptyHidrants?: () => void;
}

export function MapUIOverlays({
  setLocatePosition,
  setLocateAccuracy,
  loadingHidrants,
  hidrantsError,
  emptyHidrants,
  canSyncFromOsm,
  onDismissEmptyHidrants,
}: MapUIOverlaysProps) {
  return (
    <>
      {/* Top Left: Logo de l'aplicació (inclou el desplaçament dels controls de zoom). */}
      <MapLogo />

      {/* Top Right: Native Layers Control is at top: 10px, right: 10px.
          We place our controls under it with enough gap. */}
      <div className={`${controlContainerClass} top-18 right-3 items-end gap-2`}>
        <div className={controlItemClass}>
          <LocateButton
            className={floatingButtonClass}
            setPosition={setLocatePosition}
            setAccuracy={setLocateAccuracy}
          />
        </div>

        <div className={controlItemClass}>
          <FullscreenButton targetId="app-shell" className={floatingButtonClass} />
        </div>
      </div>

      {/* Bottom Left: Zoom Display (Above Attribution if it were there, but on the left).
          On mobile it sits above the bottomsheet bar (60px), aligned with the attribution.
          A partir del breakpoint del panell lateral (tb) no hi ha bottomsheet, així que
          baixa fins al fons del mapa. */}
      <div className={`${controlContainerClass} bottom-15 tb:bottom-1.25 left-1.25`}>
        <div className={controlItemClass}>
          <ZoomDisplay />
        </div>
      </div>

      {loadingHidrants && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/80 px-4 py-2 rounded-[20px] z-990 shadow-[0_2px_5px_rgba(0,0,0,0.2)] text-[0.8rem] pointer-events-none">
          Actualitzant hidrants...
        </div>
      )}

      {!loadingHidrants && !hidrantsError && emptyHidrants && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 max-w-[90%] flex items-start gap-2 bg-white/90 pl-4 pr-1.5 py-2 rounded-[20px] z-990 shadow-[0_2px_5px_rgba(0,0,0,0.2)] text-[0.8rem] text-center">
          <span className="pointer-events-none">
            {canSyncFromOsm
              ? "Aquesta ADF encara no té cap hidrant registrat. Baixa'ls des de la pestanya ADF → «Baixar d'OSM»."
              : "Aquesta ADF encara no té cap hidrant registrat."}
          </span>
          <button
            onClick={onDismissEmptyHidrants}
            aria-label="Tancar avís"
            title="Tancar"
            className="pointer-events-auto shrink-0 bg-transparent border-0 p-0 px-1 leading-none text-muted hover:text-ink cursor-pointer text-[0.9rem]"
          >
            ✕
          </button>
        </div>
      )}

      {hidrantsError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-700/80 text-white px-4 py-2 rounded-lg z-990 text-[0.8rem]">
          Error: {hidrantsError}
        </div>
      )}

      <OfflineNotice />
    </>
  );
}
