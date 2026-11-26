import { toast } from "react-toastify";
import { openInNativeMaps } from "@/utils/geoMaps";
import { ActionGlyph } from "./Glyphs";
import { iconButtonClass } from "@/styles/uiStyles";

interface NodeActionsProps {
  /** Enllaç que copia el botó de compartir (node o incidència segons el cas). */
  shareUrl: string;
  lat: number;
  lon: number;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
  /** L'usuari pot veure la ruta (normalment, sessió iniciada). */
  showRouteButton?: boolean;
}

export function NodeActions({
  shareUrl,
  lat,
  lon,
  showRoute,
  setShowRoute,
  hasLocation,
  showRouteButton,
}: NodeActionsProps) {
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Enllaç copiat al porta-retalls");
    } catch {
      toast.error("Error al copiar l'enllaç");
    }
  };

  const handleShowRoute = () => {
    if (!setShowRoute) {
      return;
    }
    if (!showRoute && !hasLocation) {
      toast.info("Cal activar el seguiment GPS per veure la ruta");
      return;
    }
    setShowRoute(!showRoute);
  };

  return (
    <div className="flex justify-center items-center gap-3 py-2 border-t border-soft">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleShare();
        }}
        aria-label="Compartir ubicació"
        title="Compartir ubicació"
        className={iconButtonClass}
      >
        <ActionGlyph name="share" />
      </button>

      {showRouteButton && setShowRoute && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleShowRoute();
          }}
          aria-label={showRoute ? "Tanca ruta" : "Mostra ruta"}
          title={showRoute ? "Tanca ruta" : "Mostra ruta"}
          className={`${iconButtonClass} ${showRoute ? "text-primary" : "text-muted"}`}
        >
          <ActionGlyph name="route" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openInNativeMaps(lat, lon);
        }}
        aria-label="Obrir en navegador GPS"
        title="Obrir en navegador GPS"
        className={iconButtonClass}
      >
        <ActionGlyph name="navigate" />
      </button>
    </div>
  );
}
