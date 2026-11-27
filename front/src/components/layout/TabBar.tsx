import type { PanelTab } from "./types";
import { useAdfHintVisible } from "@/hooks/useAdfHintVisible";
import { TabGlyph, type GlyphName } from "@/shared/ui/Glyphs";

/**
 * Icones de la barra: SVG monocromes amb `currentColor`, perquè el color el
 * doni l'estat (groc sobre el verd de la pestanya activa) i no un emoji.
 */
const TAB_GLYPHS: Record<string, GlyphName> = {
  mapa: "map",
  seguiment: "tracking",
  informes: "report",
  usuaris: "users",
  config: "settings",
  ajuda: "help",
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  showLabels,
  flat = false,
}: {
  tabs: PanelTab[];
  activeId: string;
  onSelect: (id: string) => void;
  showLabels: boolean;
  /** Dins del bottom sheet no duu ombra: la línia que projectava es veia com una vora. */
  flat?: boolean;
}) {
  // Mentre no hi ha cap ADF triada, la icona de l'ADF es marca perquè l'avís hi pugui apuntar.
  const showAdfHint = useAdfHintVisible();

  return (
    <div
      className={`relative z-10 flex w-full min-h-11 overflow-hidden bg-accent ${
        flat ? "" : "shadow-chrome"
      }`}
    >
      {tabs.map((t, index) => (
        <button
          key={t.id}
          data-tab={t.id}
          onClick={() => onSelect(t.id)}
          aria-current={activeId === t.id ? "page" : undefined}
          aria-label={showLabels ? undefined : t.label}
          className={`relative min-w-0 flex-1 flex flex-col items-center justify-center gap-0.5 border-0 cursor-pointer ${
            activeId === t.id
              ? // A la primera cel·la el racó esquerre ja el retalla el panell
                // (`rounded-l-xl` + `overflow-hidden`): amb els dos radis es veia
                // una doble corba amb un filet groc entremig.
                `bg-primary text-accent font-semibold ${index === 0 ? "rounded-tr-lg" : "rounded-t-lg"}`
              : "bg-transparent text-ink/65 hover:text-ink"
          }`}
        >
          <span
            className={`relative flex ${showAdfHint && index === 0 ? "adf-hint-icon" : ""}`}
            data-adf-hint-anchor={index === 0 ? "" : undefined}
          >
            <TabGlyph name={TAB_GLYPHS[t.id] ?? "map"} />
          </span>
          {/* 13 px: l'única excepció a «res per sota de 14» — amb `text-xs` no
              hi caben les sis etiquetes a 393 px. */}
          {showLabels && (
            <span className="text-[0.8125rem] tracking-tight leading-none max-w-full truncate">
              {t.label}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
