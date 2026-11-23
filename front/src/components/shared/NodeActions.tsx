import { toast } from "react-toastify";
import { useAuth } from "@/contexts/AuthContext";
import { openInNativeMaps } from "@/utils/geoMaps";
import { ShareIcon } from "./Icons";

interface NodeActionsProps {
  /** Enllaç que copia el botó de compartir (node o incidència segons el cas). */
  shareUrl: string;
  lat: number;
  lon: number;
  showRoute?: boolean;
  setShowRoute?: (v: boolean) => void;
  hasLocation?: boolean;
}

export function NodeActions({
  shareUrl,
  lat,
  lon,
  showRoute,
  setShowRoute,
  hasLocation,
}: NodeActionsProps) {
  const { user } = useAuth();

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
    <div className="flex justify-center items-center gap-6 py-2 border-t border-soft">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void handleShare();
        }}
        title="Compartir ubicació"
        className="bg-transparent border-0 cursor-pointer p-0 flex items-center"
      >
        <ShareIcon />
      </button>

      {user && setShowRoute && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleShowRoute();
          }}
          title={showRoute ? "Tanca ruta" : "Mostra ruta"}
          className={`bg-transparent border-0 cursor-pointer text-[1.4rem] p-0 ${showRoute ? "" : "grayscale opacity-50"}`}
        >
          🛣️
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openInNativeMaps(lat, lon);
        }}
        title="Obrir en navegador GPS"
        className="bg-transparent border-0 cursor-pointer text-[1.4rem] p-0"
      >
        🚕
      </button>
    </div>
  );
}
