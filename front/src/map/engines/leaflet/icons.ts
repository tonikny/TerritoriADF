import L from "leaflet";
import type { MarkerIcon } from "../../core/types";

export function toLeafletIcon(icon: MarkerIcon): L.Icon | L.DivIcon {
  if (icon.kind === "image") {
    return L.icon({
      iconUrl: icon.url,
      iconSize: icon.size,
      iconAnchor: icon.anchor,
      shadowUrl: icon.shadowUrl,
      shadowSize: icon.shadowSize,
      popupAnchor: icon.popupAnchor ?? [0, -(icon.size[1] + 2)],
    });
  }

  return L.divIcon({
    className: icon.className ?? "",
    html: icon.html,
    iconSize: icon.size,
    iconAnchor: icon.anchor,
    popupAnchor: icon.popupAnchor ?? [0, -(icon.size[1] + 2)],
  });
}

export function ringIcon(className: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<div class="${className}"></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}
