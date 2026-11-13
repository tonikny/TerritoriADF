import { useAdf } from "../../contexts/AdfContext";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { formatAge, getLastSync } from "../../utils/offlineData";

/**
 * Avís discret quan l'app funciona amb dades emmagatzemades: recorda que el que
 * es veu no és l'estat actual del servidor i des de quan és així.
 */
export function OfflineNotice() {
  const online = useOnlineStatus();
  const { activeAdf } = useAdf();

  if (online) {
    return null;
  }

  const lastSync = activeAdf ? getLastSync(activeAdf.id) : null;

  return (
    <div className="absolute bottom-15 left-1/2 -translate-x-1/2 max-w-[90%] bg-[#fff4d6]/95 text-[#7a4a00] px-4 py-2 rounded-[20px] z-990 shadow-[0_2px_5px_rgba(0,0,0,0.2)] text-[0.8rem] text-center pointer-events-none">
      Sense connexió · {lastSync ? `dades de ${formatAge(lastSync)}` : "dades emmagatzemades"}
    </div>
  );
}
