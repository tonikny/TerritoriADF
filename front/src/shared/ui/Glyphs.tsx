import type { ReactNode } from "react";

/**
 * Icones monocromes del projecte: traç de 2 px sobre `currentColor`, cantonades
 * rodones i mida de 24. Un sol estil per a tota l'app (res d'emojis de color),
 * i prou gruixudes perquè es llegeixin en una pantalla de mòbil.
 */
export type GlyphName =
  | "map"
  | "tracking"
  | "report"
  | "users"
  | "settings"
  | "help"
  | "edit"
  | "close"
  | "trash"
  | "link"
  | "refresh"
  | "plus"
  | "palette"
  | "engine"
  | "alert"
  | "flame"
  | "smoke"
  | "car"
  | "download"
  | "filter"
  | "lock"
  | "chevron"
  | "key"
  | "bell"
  | "layers"
  | "share"
  | "route"
  | "navigate"
  | "locate"
  | "arrowUp"
  | "arrowDown"
  | "expand"
  | "collapse"
  | "send";

const PATHS: Record<GlyphName, ReactNode> = {
  map: (
    <>
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </>
  ),
  tracking: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <circle cx="12" cy="12" r="7.2" strokeDasharray="2.4 3" />
      <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2" />
    </>
  ),
  report: (
    <>
      <path d="M6.5 3H14l4 4v14H6.5z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 12.5h5M9.5 16.5h5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.2" />
      <path d="M3.5 19.5c0-3 2.7-4.8 6-4.8s6 1.8 6 4.8" />
      <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.9c2 .5 3.3 2 3.3 4.1" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7.5h7.5M17 7.5H20M4 16.5h3.5M13 16.5H20" />
      <circle cx="14.5" cy="7.5" r="2.4" />
      <circle cx="10.5" cy="16.5" r="2.4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.8.4-1 .9-1 1.7v.4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  trash: (
    <>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.8a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.4 6.7" />
      <path d="M14 10.2a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 3.5V8h-4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  palette: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-1.6-1.6-1.9-1.6-3.1 0-1 .8-1.6 1.9-1.6h1.4a4.8 4.8 0 0 0 4.8-4.8c0-3.6-3.8-5.7-8.5-5.7Z" />
      <path d="M7.6 9.6h.01M10.6 6.9h.01M14.6 7.4h.01M17 10.4h.01" />
    </>
  ),
  engine: (
    <>
      <circle cx="12" cy="12" r="2.9" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
      <circle cx="12" cy="12" r="8.4" strokeDasharray="1.6 3.4" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.2 21 19.5H3L12 4.2Z" />
      <path d="M12 9.8v4.1M12 16.6h.01" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3.2c3.2 4 5.8 6 5.8 9.6A5.8 5.8 0 0 1 6.2 12.8c0-2 .9-3.3 2.4-4.7.4 1.4 1 2.2 1.9 2.6.2-2.2.6-4.3 1.5-7.5Z" />
    </>
  ),
  smoke: (
    <>
      <path d="M7 18.5h9.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.7 3.7 0 0 0 7 18.5Z" />
      <path d="M9.5 21h6" />
    </>
  ),
  car: (
    <>
      <path d="M4 16.5v-3l1.8-4.2A2 2 0 0 1 7.6 8h8.8a2 2 0 0 1 1.8 1.3L20 13.5v3" />
      <path d="M3.5 13.5h17" />
      <circle cx="7.5" cy="17" r="1.8" />
      <circle cx="16.5" cy="17" r="1.8" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v10M8 10l4 4 4-4" />
      <path d="M4.5 17.5v2h15v-2" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.5 7.6v6.4l-4 1.8v-8.2L3.5 5.5Z" />,
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  chevron: <path d="M9 5l7 7-7 7" />,
  key: (
    <>
      <circle cx="7.5" cy="8.5" r="3.6" />
      <path d="M10.2 11.2 19.5 20.5" />
      <path d="M16.4 17.4 14.6 19.2M18.9 19.9l-1.8 1.8" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.5H4.4L6 16.5Z" />
      <path d="M9.8 19.2a2.2 2.2 0 0 0 4.4 0" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5 3 8l9 4.5L21 8l-9-4.5Z" />
      <path d="M3.8 12.2 12 16.3l8.2-4.1" />
      <path d="M3.8 16.2 12 20.3l8.2-4.1" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5.5" r="2.8" />
      <circle cx="6" cy="12" r="2.8" />
      <circle cx="18" cy="18.5" r="2.8" />
      <path d="M8.5 13.3 15.5 17.2M15.5 6.8 8.5 10.7" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18.5" r="2.2" />
      <circle cx="18" cy="5.5" r="2.2" />
      <path d="M8.2 18.5h4.3a3.5 3.5 0 0 0 0-7h-1a3.5 3.5 0 0 1 0-7h4.3" />
    </>
  ),
  navigate: (
    <>
      <path d="M12 3.6 20.4 20.4 12 16.7 3.6 20.4 12 3.6Z" />
    </>
  ),
  locate: (
    <>
      <circle cx="12" cy="12" r="6.4" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6" />
    </>
  ),
  arrowUp: <path d="M12 19.5V5M5.5 11.5 12 5l6.5 6.5" />,
  arrowDown: <path d="M12 4.5V19M5.5 12.5 12 19l6.5-6.5" />,
  expand: <path d="M9.5 4.5h-5v5M14.5 4.5h5v5M14.5 19.5h5v-5M9.5 19.5h-5v-5" />,
  collapse: <path d="M4.5 9.5h5v-5M19.5 9.5h-5v-5M19.5 14.5h-5v5M4.5 14.5h5v5" />,
  send: (
    <>
      <path d="M4 12 20.5 4.5 14 20l-2.3-6.2L4 12Z" />
      <path d="M11.7 13.8 20.5 4.5" />
    </>
  ),
};

export function Glyph({
  name,
  size = 20,
  strokeWidth = 2,
  className = "",
}: {
  name: GlyphName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * Icona d'acció (botons, controls): sempre la mateixa mida i el mateix gruix, per
 *què totes les accions de l'app es vegin igual. No s'usa per a icones de domini.
 */
export function ActionGlyph({ name }: { name: GlyphName }) {
  return <Glyph name={name} size={18} strokeWidth={2.2} />;
}

/** Icona gran de la barra de pestanyes: mateix dibuix, més gruix i 23 px. */
export function TabGlyph({ name }: { name: GlyphName }) {
  return <Glyph name={name} size={23} strokeWidth={2.2} />;
}
