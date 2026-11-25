import type { MarkerIcon } from "@/map/core/types";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import { getHidrantIconUrl, getHidrantStatus, hidrant_shadow } from "@/utils/icons";
import { emojiTipusIncidencia } from "@/utils/incidenciaConstants";

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

export function hidrantIcon(feature: HidrantFeature): MarkerIcon {
  return {
    kind: "image",
    url: getHidrantIconUrl(getHidrantStatus(feature.properties.ui_fields)),
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
    return "#15803d";
  }
  if (age < 300_000) {
    return "#ca8a04";
  }
  if (age < 600_000) {
    return "#ea580c";
  }
  return "#dc2626";
}

const TRACKING_FONT_SIZE = 12;
const TRACKING_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
// --- Ajustos de l'etiqueta (tot en píxels CSS) ---------------------------------
/** Alçada de la píndola. Menys = més estilitzada. */
const TRACKING_PILL_HEIGHT = 18;
/** Farciment horitzontal a cada costat del text. */
const TRACKING_PAD_X = 5;
/** Gruix del contorn blanc (es dibuixa centrat sobre la vora). */
const TRACKING_STROKE = 1.5;
/** Amplada mínima perquè els noms molt curts no quedin raquítics. */
const TRACKING_MIN_WIDTH = 38;
/** Inclinació de tota l'etiqueta (graus; negatiu = cap amunt a la dreta). */
const TRACKING_ANGLE_DEG = -40;
/** Direcció de la punta girada (graus; 90 = vertical cap avall). */
const TRACKING_TAIL_ANGLE_DEG = 78;
/** Longitud de la punta des de la cantonada inferior esquerra. */
const TRACKING_TAIL_LENGTH = 13;
/** On enllaça la punta amb la vora inferior, des del final de la corba esquerra. */
const TRACKING_TAIL_JOIN_X = 1.5;
/** Punt de la corba esquerra on arrenca la punta (graus del cercle). */
const TRACKING_TAIL_JOIN_ANGLE_DEG = 132;
/** Marge del llenç perquè el contorn i l'ombra no quedin tallats. */
const TRACKING_MARGIN = Math.ceil(TRACKING_STROKE / 2) + 2;

const px = (value: number): number => Math.round(value * 10) / 10;

let measureContext: CanvasRenderingContext2D | null = null;

/** Amplada del nom amb la mateixa font que el text de l'etiqueta. */
function measureTrackingLabel(label: string): number {
  if (typeof document === "undefined") {
    return label.length * 7.5;
  }
  if (!measureContext) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (!measureContext) {
    return label.length * 7.5;
  }
  measureContext.font = `700 ${TRACKING_FONT_SIZE}px ${TRACKING_FONT_FAMILY}`;
  return measureContext.measureText(label).width;
}

function escapeXml(value: string): string {
  const entities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  };
  return value.replace(/[&<>"']/g, (char) => entities[char]);
}

/**
 * Etiqueta d'OwnTracks: píndola girada amb la punta a la cantonada inferior
 * esquerra i el nom de l'usuari. La punta queda exactament a la posició real
 * (`anchor`), `size` cobreix tota l'etiqueta girada perquè sigui clicable
 * sencera, i `popupAnchor` posa el popup just a sobre del text.
 */
export function trackingPin(label: string, backgroundColor: string): MarkerIcon {
  const labelWidth = Math.ceil(measureTrackingLabel(label));
  const pillWidth = Math.max(TRACKING_MIN_WIDTH, labelWidth + TRACKING_PAD_X * 2);
  const radius = TRACKING_PILL_HEIGHT / 2;

  // La punta penja vertical a la pantalla. En coordenades de la píndola va
  // girada amb l'etiqueta: així el contorn surt de la mateixa cantonada i es
  // pot enllaçar amb la vora sense trencar-lo.
  const tailRadians = ((TRACKING_TAIL_ANGLE_DEG - TRACKING_ANGLE_DEG) * Math.PI) / 180;
  const tailDir = { x: Math.cos(tailRadians), y: Math.sin(tailRadians) };
  const corner = { x: radius - radius * Math.SQRT1_2, y: radius + radius * Math.SQRT1_2 };
  const tip = {
    x: corner.x + tailDir.x * TRACKING_TAIL_LENGTH,
    y: corner.y + tailDir.y * TRACKING_TAIL_LENGTH,
  };

  // Punts on el contorn de la píndola s'obre cap a la punta: la vora inferior i
  // la corba esquerra. El traç és un sol camí, perquè la punta quedi cosida a
  // la píndola (amb dues figures separades es veia el contorn blanc entremig).
  const joinAngle = (TRACKING_TAIL_JOIN_ANGLE_DEG * Math.PI) / 180;
  const joinLeft = {
    x: radius + radius * Math.cos(joinAngle),
    y: radius + radius * Math.sin(joinAngle),
  };
  const joinRight = { x: radius + TRACKING_TAIL_JOIN_X, y: TRACKING_PILL_HEIGHT };
  // Costats de la cua: rectes. Qualsevol bulb els fa agafar aspecte d'ou.
  const rightControl = {
    x: (joinRight.x + tip.x) / 2,
    y: (joinRight.y + tip.y) / 2,
  };
  const leftControl = {
    x: (joinLeft.x + tip.x) / 2,
    y: (joinLeft.y + tip.y) / 2,
  };

  const shape = [
    `M ${px(joinLeft.x)} ${px(joinLeft.y)}`,
    `A ${px(radius)} ${px(radius)} 0 0 1 ${px(radius)} 0`,
    `L ${px(pillWidth - radius)} 0`,
    `A ${px(radius)} ${px(radius)} 0 0 1 ${px(pillWidth - radius)} ${px(TRACKING_PILL_HEIGHT)}`,
    `L ${px(joinRight.x)} ${px(TRACKING_PILL_HEIGHT)}`,
    `Q ${px(rightControl.x)} ${px(rightControl.y)} ${px(tip.x)} ${px(tip.y)}`,
    `Q ${px(leftControl.x)} ${px(leftControl.y)} ${px(joinLeft.x)} ${px(joinLeft.y)}`,
    "Z",
  ].join(" ");

  // Girem tota l'etiqueta al voltant de la punta, que és l'ancoratge.
  const radians = (TRACKING_ANGLE_DEG * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const rotate = (point: { x: number; y: number }) => {
    const dx = point.x - tip.x;
    const dy = point.y - tip.y;
    return {
      x: tip.x + dx * cos - dy * sin,
      y: tip.y + dx * sin + dy * cos,
    };
  };

  const outline = [
    { x: 0, y: 0 },
    { x: pillWidth, y: 0 },
    { x: pillWidth, y: TRACKING_PILL_HEIGHT },
    { x: 0, y: TRACKING_PILL_HEIGHT },
    tip,
    joinLeft,
    joinRight,
    rightControl,
    leftControl,
  ].map(rotate);

  const minX = Math.min(...outline.map((point) => point.x)) - TRACKING_MARGIN;
  const maxX = Math.max(...outline.map((point) => point.x)) + TRACKING_MARGIN;
  const minY = Math.min(...outline.map((point) => point.y)) - TRACKING_MARGIN;
  const maxY = Math.max(...outline.map((point) => point.y)) + TRACKING_MARGIN;
  const width = Math.ceil(maxX - minX);
  const height = Math.ceil(maxY - minY);
  const anchorX = tip.x - minX;
  const anchorY = tip.y - minY;

  // El popup s'ancora sobre la vora superior del text, no damunt de l'extrem
  // que queda més amunt amb l'etiqueta girada.
  const popup = rotate({ x: pillWidth / 2, y: 0 });

  return {
    kind: "html",
    className: "",
    size: [width, height],
    anchor: [anchorX, anchorY],
    popupAnchor: [px(popup.x - tip.x), px(popup.y - tip.y - 2)],
    html: `<svg width="${width}" height="${height}" viewBox="${px(minX)} ${px(minY)} ${width} ${height}" style="display:block;overflow:visible">
      <g transform="rotate(${TRACKING_ANGLE_DEG} ${px(tip.x)} ${px(tip.y)})" style="filter:drop-shadow(0 1px 1.5px rgba(15,23,42,0.45))">
        <path d="${shape}" fill="${backgroundColor}" stroke="#ffffff" stroke-width="${TRACKING_STROKE}" stroke-linejoin="round"/>
        <text x="${px(pillWidth / 2)}" y="${px(TRACKING_PILL_HEIGHT / 2)}" text-anchor="middle" dominant-baseline="central" font-family='${TRACKING_FONT_FAMILY}' font-size="${TRACKING_FONT_SIZE}" font-weight="700" letter-spacing="0.15" fill="#ffffff">${escapeXml(label)}</text>
      </g>
    </svg>`,
  };
}
