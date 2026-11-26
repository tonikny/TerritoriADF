export const floatingButtonClass =
  "bg-white text-ink border border-border-strong rounded-md w-8.5 h-8.5 text-[1.2rem] cursor-pointer z-990 shadow-control flex items-center justify-center p-0";

export const controlContainerClass = "absolute flex flex-col gap-2.5 z-990 pointer-events-none";

export const controlItemClass = "pointer-events-auto";

/** Botó d'acció només icona: quadrat de 32 px, la mateixa alçada que la resta de controls. */
export const iconButtonClass =
  "inline-flex items-center justify-center min-h-8 min-w-8 p-0 bg-white text-ink border border-border-strong rounded-md cursor-pointer shadow-control hover:bg-soft active:shadow-none disabled:opacity-50";

/* Una sola alçada per als controls (32 px) i un sol padding horitzontal
   (10 px), compartit amb els botons. Els quadrats de mapa queden a part. */
export const inputClass =
  "border border-border-strong rounded-md bg-white text-base w-full min-h-8 py-1 px-2.5";

export const selectClass = `${inputClass} bg-white`;

/** Select compacte per a files d'etiqueta + control (no ocupa tot l'ample). */
export const compactSelectClass =
  "border border-border-strong rounded-md bg-white text-sm min-h-8 py-1 px-2 max-w-44 cursor-pointer";

/* Un sol padding horitzontal per a tots els botons (10 px, els mateixos que els
   inputs). Les variants només hi afegeixen alçada, gap i color; repetir un
   `px-*` al consumidor no és fiable (guanya l'utilitat que surt més tard al
   CSS, no la que s'escriu més a prop). */
const buttonPx = "px-2.5";

const secondarySurface = `inline-flex items-center justify-center ${buttonPx} bg-white text-ink border border-border-strong rounded-md cursor-pointer shadow-control hover:bg-soft active:shadow-none`;

/** Botó blanc compacte (accions de fila, capçaleres): 32 px. */
export const secondaryCompactClass = `${secondarySurface} gap-1.5 min-h-8 text-sm`;

/** Icona i text a 2 px: «↓ OSM» de les capçaleres i els botons de fila OSM. */
export const secondaryTightClass = `${secondarySurface} gap-0.5 min-h-8 py-1 text-sm`;

/** Versió de fila de `secondaryTightClass`: menys padding vertical i text de 14 px. */
export const secondaryRowClass = `${secondarySurface} gap-0.5 min-h-8 py-0.5 text-xs`;

export const primaryButtonClass = `inline-flex items-center justify-center gap-1.5 min-h-8 bg-primary text-white ${buttonPx} py-1 border-0 rounded-md cursor-pointer text-sm font-semibold leading-tight`;

/** Botó blanc d'acció: 32 px, la mateixa alçada que inputs, selects i acordions. */
export const secondaryButtonClass = `${secondarySurface} gap-1.5 min-h-8 py-1 text-sm`;

export const dangerButtonClass = `inline-flex items-center justify-center gap-1.5 min-h-8 bg-alert text-white ${buttonPx} py-1 border-0 rounded-md cursor-pointer text-sm font-semibold leading-tight w-full`;

/**
 * Base de botó ple: 32 px i text blanc, amb el fons que tria el consumidor
 * (`bg-ok` per operatiu, `bg-warn` per revisió…). No porta cap color propi per
 *què no hi pugui haver xoc de `bg-*`.
 */
export const filledButtonClass = `inline-flex items-center justify-center gap-1 min-h-8 border-0 rounded-md ${buttonPx} py-1 text-sm font-semibold text-white cursor-pointer`;

export const popupContainerClass =
  "bg-white p-4 rounded-lg shadow-panel w-[min(calc(100vw-60px),340px)] max-h-[85vh] overflow-y-auto z-[2000] font-sans relative";

export const modalOverlayClass =
  "fixed inset-0 bg-black/40 flex justify-center items-center z-[6000]";
