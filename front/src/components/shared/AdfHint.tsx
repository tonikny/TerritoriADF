import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useAdfHintVisible } from "../../hooks/useAdfHintVisible";

type Box = { left: number; top: number; width: number; height: number };
type HintLayout = { area: Box; icon: Box };

/** Espai que es deixa per sota de l'àrea del mapa quan la barra de pestanyes és a baix. */
const BOTTOM_BAR_GAP = 20;
/** Distància des del centre de la icona on acaba la fletxa (fora de l'anell). */
const ICON_CLEARANCE = 24;
/** Separació entre la targeta i l'inici de la línia. */
const CARD_GAP = 10;
/** Per sota d'aquesta alçada (bottomsheet molt desplegat) l'avís no cap i s'amaga. */
const MIN_AREA_HEIGHT = 180;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function measure(): HintLayout | null {
  const map = document.getElementById("map-container")?.getBoundingClientRect();
  if (!map) {
    return null;
  }
  // Amb el menú desplegat l'avís no hi cap i el taparia: s'amaga fins que es torni a tancar.
  const sheet = document.querySelector<HTMLElement>("[data-bottom-sheet]");
  if (sheet?.getBoundingClientRect().width && sheet.dataset.bottomSheet === "open") {
    return null;
  }
  const icon = [...document.querySelectorAll<HTMLElement>("[data-adf-hint-anchor]")]
    .map((el) => el.getBoundingClientRect())
    .find((rect) => rect.width > 0);
  if (!icon) {
    return null;
  }
  // Si la icona és a la meitat inferior del mapa, la barra de pestanyes és la del bottomsheet.
  const isBottomBar = icon.top > map.top + map.height / 2;
  const bottom = isBottomBar ? icon.top - BOTTOM_BAR_GAP : map.bottom;
  return {
    area: { left: map.left, top: map.top, width: map.width, height: bottom - map.top },
    icon: { left: icon.left, top: icon.top, width: icon.width, height: icon.height },
  };
}

/**
 * Corba des del centre de la targeta fins a la icona, amb punta de fletxa al final.
 * La línia surt sempre pel centre del costat que mira a la icona, perpendicular a la
 * targeta: així no arrenca d'una cantonada ni ressegueix la vora.
 */
function arrowPath(card: Box, icon: Box): string {
  const iconX = icon.left + icon.width / 2;
  const iconY = icon.top + icon.height / 2;
  const cardX = card.left + card.width / 2;
  const cardY = card.top + card.height / 2;

  const below = iconY > cardY;
  const startX = cardX;
  const startY = below ? card.top + card.height + CARD_GAP : card.top - CARD_GAP;

  // La punta s'atura abans d'arribar a la icona, fora de l'anell.
  const toCardX = cardX - iconX;
  const toCardY = cardY - iconY;
  const len = Math.hypot(toCardX, toCardY) || 1;
  const endX = iconX + (toCardX / len) * ICON_CLEARANCE;
  const endY = iconY + (toCardY / len) * ICON_CLEARANCE;

  // Punt de control sobre l'eix vertical de la targeta: la línia en surt recta i gira cap a la icona.
  const ctrlY = startY + (endY - startY) * 0.6;

  return `M ${round(startX)} ${round(startY)} Q ${round(startX)} ${round(ctrlY)} ${round(endX)} ${round(endY)}`;
}

/**
 * Avís d'inici: una targeta centrada al mapa i una línia independent amb punta de
 * fletxa que assenyala la icona de l'ADF del menú. No tapa el mapa (`pointer-events-none`).
 */
export function AdfHint() {
  const visible = useAdfHintVisible();
  const [layout, setLayout] = useState<HintLayout | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const refreshLayout = useCallback(() => {
    setLayout(measure());
  }, []);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const frame = requestAnimationFrame(refreshLayout);
    // La barra del bottomsheet es pot arrossegar: es torna a mesurar mentre l'avís és visible.
    const timer = window.setInterval(refreshLayout, 400);
    window.addEventListener("resize", refreshLayout);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", refreshLayout);
    };
  }, [visible, refreshLayout]);

  // La fletxa necessita la mida real de la targeta, que només es coneix després de pintar-la.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!layout || !card) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      setPath(
        arrowPath(
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          layout.icon,
        ),
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  if (!visible || !layout) {
    return null;
  }
  const tooSmall = layout.area.height < MIN_AREA_HEIGHT;

  return (
    <>
      {!tooSmall && path && (
        <svg
          className="adf-hint-fade pointer-events-none fixed inset-0 z-1040 h-full w-full"
          aria-hidden
        >
          <defs>
            <marker
              id="adf-hint-arrowhead"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="#007bff" />
            </marker>
          </defs>
          {/* Halo blanc perquè la línia es llegeixi sobre el mapa */}
          <path
            d={path}
            fill="none"
            stroke="#fff"
            strokeWidth={5}
            strokeLinecap="round"
            opacity={0.7}
          />
          <path
            className="adf-hint-dash"
            d={path}
            fill="none"
            stroke="#007bff"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="8 7"
            markerEnd="url(#adf-hint-arrowhead)"
          />
        </svg>
      )}

      <div
        ref={cardRef}
        className={`adf-hint-fade pointer-events-none fixed z-1041 w-64 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-primary/30 bg-white px-4 py-3 text-center shadow-[0_10px_30px_rgba(0,0,0,0.22)] ${
          tooSmall ? "hidden" : ""
        }`}
        style={{
          left: layout.area.left + layout.area.width / 2,
          top: layout.area.top + layout.area.height / 2,
        }}
      >
        <p className="m-0 text-[0.9rem] font-semibold text-ink">Tria una ADF per començar</p>
        <p className="m-0 mt-1 text-[0.78rem] leading-snug text-muted">
          Fes clic a la 🗺️ ADF del menú per veure el mapa i les dades de la teva ADF.
        </p>
      </div>
    </>
  );
}
