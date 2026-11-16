import type { MarkerIcon } from "../core/types";
import type { HidrantFeature } from "../../hooks/useHidrantData";
import type { IncidenciaFeature } from "../../types";
import { getHydrantIconUrl, getHydrantStatus, hidrant_shadow } from "../../utils/icons";
import { emojiTipusIncidencia } from "../../utils/incidenciaConstants";

export const USER_ICON: MarkerIcon = {
  kind: "image",
  url: "/images/icons/marker-icon-green.png",
  size: [25, 41],
  anchor: [12, 41],
};

export const CREATE_ICON: MarkerIcon = {
  kind: "image",
  url: "/images/icons/marker-icon-gold.png",
  size: [25, 41],
  anchor: [12, 41],
};

export function hydrantIcon(feature: HidrantFeature): MarkerIcon {
  return {
    kind: "image",
    url: getHydrantIconUrl(getHydrantStatus(feature.properties.ui_fields)),
    size: [25, 41],
    anchor: [12, 41],
    shadowUrl: hidrant_shadow,
    shadowSize: [41, 41],
  };
}

export function incidenciaIcon(feature: IncidenciaFeature): MarkerIcon {
  const prioritat = feature.properties.prioritat?.toUpperCase();
  const emoji = emojiTipusIncidencia(feature.properties.tipus);
  const glow = prioritat === "ALTA" ? "0 0 10px red" : "0 0 5px orange";

  return {
    kind: "html",
    className: "incidencia-marker",
    html: `<div style="font-size:28px;display:flex;justify-content:center;align-items:center;filter:drop-shadow(2px 2px 2px rgba(0,0,0,0.5));text-shadow:${glow};">${emoji}</div>`,
    size: [30, 30],
    anchor: [15, 15],
  };
}

export function ageColor(receivedAt: number): string {
  const age = Date.now() - receivedAt;
  if (age < 120_000) {
    return "#22c55e";
  }
  if (age < 300_000) {
    return "#eab308";
  }
  if (age < 600_000) {
    return "#f97316";
  }
  return "#ef4444";
}

export function trackingPin(label: string, backgroundColor: string): MarkerIcon {
  return {
    kind: "html",
    className: "",
    size: [26, 44],
    anchor: [13, 44],
    html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.3))">
      <div style="width:26px;height:26px;border-radius:50%;background:${backgroundColor};display:flex;align-items:center;justify-content:center;">
        <span style="font-size:9px;font-weight:700;color:#333">${label}</span>
      </div>
      <div style="width:0;height:0;margin-top:-2px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid ${backgroundColor};"></div>
    </div>`,
  };
}
