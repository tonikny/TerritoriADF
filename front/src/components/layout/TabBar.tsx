import type { PanelTab } from "./types";
import { ICONS_H } from "./metrics";
import { useAdfHintVisible } from "../../hooks/useAdfHintVisible";

export function TabBar({
  tabs,
  activeId,
  onSelect,
  showLabels,
}: {
  tabs: PanelTab[];
  activeId: string;
  onSelect: (id: string) => void;
  showLabels: boolean;
}) {
  // Mentre no hi ha cap ADF triada, la icona de l'ADF es marca perquè l'avís hi pugui apuntar.
  const showAdfHint = useAdfHintVisible();

  return (
    <div className="flex w-full bg-neutral-100 border-b border-soft" style={{ height: ICONS_H }}>
      {tabs.map((t, index) => (
        <button
          key={t.id}
          data-tab={t.id}
          onClick={() => onSelect(t.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 bg-transparent border-0 cursor-pointer ${
            activeId === t.id ? "text-primary font-semibold" : "text-muted"
          }`}
        >
          <span
            className={`relative block text-[1.15rem] leading-none ${
              showAdfHint && index === 0 ? "adf-hint-icon" : ""
            }`}
            data-adf-hint-anchor={index === 0 ? "" : undefined}
          >
            {t.icon}
          </span>
          {showLabels && <span className="text-[0.7rem] leading-none">{t.label}</span>}
        </button>
      ))}
    </div>
  );
}
