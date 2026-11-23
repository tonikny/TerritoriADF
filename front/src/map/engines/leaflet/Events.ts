import { useEffect } from "react";
import type { LeafletMouseEvent, Map as LeafletMap } from "leaflet";
import type { LatLon } from "@/map/core/types";
import { attachLongPress, isRecentLongPress } from "@/map/shared/longPress";

type Handlers = {
  onClick?: (position: LatLon) => void;
  onContextMenu?: (position: LatLon) => void;
  onLongPress?: (position: LatLon) => void;
};

export function useLeafletEvents(map: LeafletMap, handlers: Handlers): void {
  const { onClick, onContextMenu, onLongPress } = handlers;

  useEffect(() => {
    const handleClick = (event: LeafletMouseEvent) => {
      onClick?.({ lat: event.latlng.lat, lon: event.latlng.lng });
    };

    const handleContextMenu = (event: LeafletMouseEvent) => {
      event.originalEvent?.preventDefault();
      if (isRecentLongPress()) {
        return;
      }
      onContextMenu?.({ lat: event.latlng.lat, lon: event.latlng.lng });
    };

    map.on("click", handleClick);
    map.on("contextmenu", handleContextMenu);

    const detachLongPress = attachLongPress(map.getContainer(), (clientX, clientY) => {
      const latlng = map.containerPointToLatLng([clientX, clientY]);
      onLongPress?.({ lat: latlng.lat, lon: latlng.lng });
    });

    return () => {
      map.off("click", handleClick);
      map.off("contextmenu", handleContextMenu);
      detachLongPress();
    };
  }, [map, onClick, onContextMenu, onLongPress]);
}
