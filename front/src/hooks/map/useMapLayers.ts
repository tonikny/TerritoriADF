import { useMemo } from "react";

import { TRACKING_STORAGE_KEY } from "@/hooks/usePositionPolling";
import { DEFAULT_BASEMAP_ID, getBasemap } from "@/map/shared/basemaps";
import { technicalLayers } from "@/map/shared/overlays";
import { storageKey } from "@/utils/storageKeys";
import { useLocalStorage } from "@/utils/useLocalStorage";

/**
 * Capes i preferències de visualització del mapa (desades a `localStorage`).
 *
 * El nom de cada clau es manté per no perdre les preferències dels usuaris
 * actuals; `trackingVisible` comparteix clau amb el polling de posicions.
 */
export function useMapLayers() {
  const [baseLayer, setBaseLayer] = useLocalStorage<string>(
    storageKey("base_layer"),
    DEFAULT_BASEMAP_ID,
  );
  const [activeTechnicalLayer, setActiveTechnicalLayer] = useLocalStorage<string | null>(
    storageKey("technical_layer"),
    null,
  );
  const [hidrantsVisible, setHidrantsVisible] = useLocalStorage<boolean>(
    storageKey("hydrants_visible"),
    true,
  );
  const [incidenciesVisible, setIncidenciesVisible] = useLocalStorage<boolean>(
    storageKey("incidencies_visible"),
    true,
  );
  const [trackingVisible, setTrackingVisible] = useLocalStorage<boolean>(
    TRACKING_STORAGE_KEY,
    false,
  );
  const [terrain3d, setTerrain3d] = useLocalStorage<boolean>(storageKey("terrain_3d"), false);
  const [terrainX2, setTerrainX2] = useLocalStorage<boolean>(storageKey("terrain_x2"), false);

  const baseRaster = useMemo(() => getBasemap(baseLayer).raster, [baseLayer]);
  const technicalLayerList = useMemo(() => technicalLayers(), []);

  const overlayRasters = useMemo(() => {
    const active = technicalLayerList.find((layer) => layer.id === activeTechnicalLayer);
    return active ? [active.overlay] : [];
  }, [activeTechnicalLayer, technicalLayerList]);

  return {
    baseLayer,
    setBaseLayer,
    activeTechnicalLayer,
    setActiveTechnicalLayer,
    hidrantsVisible,
    setHidrantsVisible,
    incidenciesVisible,
    setIncidenciesVisible,
    trackingVisible,
    setTrackingVisible,
    terrain3d,
    setTerrain3d,
    terrainX2,
    setTerrainX2,
    baseRaster,
    overlayRasters,
    technicalLayerList,
  };
}
