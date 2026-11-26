import { FullscreenButton } from "./FullscreenButton";
import { LocateButton } from "./LocateButton";
import { MapLogo } from "./MapLogo";
import type { ReactNode } from "react";
import { OfflineNotice } from "./OfflineNotice";
import { ZoomDisplay } from "./ZoomDisplay";
import { MapScale } from "./MapScale";
import { MapAttribution } from "@/map/ui/MapAttribution";
import type { LatLon } from "@/map/core/types";
import { floatingButtonClass, controlContainerClass, controlItemClass } from "@/styles/uiStyles";
import { Glyph } from "@/shared/ui/Glyphs";

interface MapUIOverlaysProps {
  layers?: ReactNode;
  center: LatLon;
  zoom: number;
  tracking: boolean;
  onToggleTracking: () => void;
  loadingHidrants: boolean;
  hidrantsError: string | null;
  /** L'ADF s'ha carregat i no té cap hidrant a la base de dades. */
  hidrantsEmpty?: boolean;
  /** L'usuari pot baixar hidrants d'OSM (permís sync_osm). */
  canSyncFromOsm?: boolean;
  onDismissEmptyHidrants?: () => void;
  /** Atribucions del mapa, una per línia. Només s'usa amb MapLibre. */
  attributionLines?: string[];
}

export function MapUIOverlays({
  layers,
  center,
  zoom,
  tracking,
  onToggleTracking,
  loadingHidrants,
  hidrantsError,
  hidrantsEmpty,
  canSyncFromOsm,
  onDismissEmptyHidrants,
  attributionLines,
}: MapUIOverlaysProps) {
  return (
    <>
      <MapLogo />

      <div className={`${controlContainerClass} top-2 right-3 items-end gap-2`}>
        {layers && <div className={controlItemClass}>{layers}</div>}

        <div className={controlItemClass}>
          <LocateButton
            className={floatingButtonClass}
            tracking={tracking}
            onToggle={onToggleTracking}
          />
        </div>

        <div className={controlItemClass}>
          <FullscreenButton targetId="app-shell" className={floatingButtonClass} />
        </div>
      </div>

      <div className={`${controlContainerClass} map-zoom-control`}>
        <MapScale center={center} zoom={zoom} />
        <div className={controlItemClass}>
          <ZoomDisplay zoom={zoom} />
        </div>
      </div>

      {attributionLines && <MapAttribution lines={attributionLines} />}

      {loadingHidrants && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/80 px-4 py-2 rounded-lg z-990 shadow-control text-sm pointer-events-none">
          Actualitzant hidrants...
        </div>
      )}

      {!loadingHidrants && !hidrantsError && hidrantsEmpty && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 max-w-[90%] flex items-start gap-2 bg-white/90 pl-4 pr-1.5 py-2 rounded-lg z-990 shadow-control text-sm text-center">
          <span className="pointer-events-none">
            {canSyncFromOsm
              ? "Aquesta ADF encara no té cap hidrant registrat. Baixa'ls des de la pestanya ADF → botó «OSM»."
              : "Aquesta ADF encara no té cap hidrant registrat."}
          </span>
          <button
            onClick={onDismissEmptyHidrants}
            aria-label="Tancar avís"
            title="Tancar"
            className="pointer-events-auto shrink-0 bg-transparent border-0 p-0 px-1 leading-none text-muted hover:text-ink cursor-pointer text-sm"
          >
            <Glyph name="close" size={18} strokeWidth={2.2} />
          </button>
        </div>
      )}

      {hidrantsError && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-alert/90 text-white px-4 py-2 rounded-lg z-990 text-sm">
          Error: {hidrantsError}
        </div>
      )}

      <OfflineNotice />
    </>
  );
}
