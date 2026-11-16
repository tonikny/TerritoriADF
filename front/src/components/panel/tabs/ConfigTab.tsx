import { useState } from "react";
import { FONT_SCALES, getFontScale, setFontScale } from "../../../utils/fontScale";
import { selectClass } from "../../../styles/uiStyles";
import { CollapsibleSection } from "../shared/CollapsibleSection";
import { TelegramConfigPanel } from "../../shared/TelegramConfigPanel";
import { ENGINE_LABELS } from "../../../map/core/capabilities";
import { detectWebgl2 } from "../../../map/core/engineSelection";
import type { EngineId } from "../../../map/core/types";
import type { EnginePreference } from "../../../map/core/engineSelection";

export function ConfigTab({
  engine,
  enginePreference,
  onEngineChange,
}: {
  engine?: EngineId;
  enginePreference?: EnginePreference;
  onEngineChange?: (preference: EnginePreference) => void;
}) {
  const [fontScale, setFontScaleValue] = useState(getFontScale());
  const webgl2 = detectWebgl2();

  return (
    <div className="p-4 space-y-4">
      <h3 className="m-0 mb-3 text-[0.95rem] font-semibold">Configuració</h3>
      <CollapsibleSection title="🎨 Aparença">
        <label className="flex items-center justify-between gap-2 text-[0.85rem]">
          <span>Mida de text</span>
          <select
            value={fontScale}
            onChange={(e) => {
              const v = Number(e.target.value);
              setFontScaleValue(v);
              setFontScale(v);
            }}
            className={`${selectClass} max-w-32 px-1`}
          >
            {FONT_SCALES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </CollapsibleSection>

      {onEngineChange && (
        <CollapsibleSection title="🗺️ Motor de mapa">
          <label className="flex items-center justify-between gap-2 text-[0.85rem]">
            <span>Motor</span>
            <select
              value={enginePreference ?? "auto"}
              onChange={(e) => onEngineChange(e.target.value as EnginePreference)}
              className={`${selectClass} max-w-40 px-1`}
            >
              <option value="auto">Automàtic</option>
              <option value="maplibre" disabled={!webgl2}>
                MapLibre
              </option>
              <option value="leaflet">Leaflet</option>
            </select>
          </label>
          <p className="text-[0.75rem] text-muted mt-1">
            Motor actiu: {engine ? ENGINE_LABELS[engine] : "—"}.
            {webgl2
              ? " Aquest dispositiu suporta WebGL2."
              : " Aquest dispositiu no té WebGL2: s'usa Leaflet."}
          </p>
        </CollapsibleSection>
      )}

      <section className="border-t border-border pt-3">
        <TelegramConfigPanel />
      </section>
    </div>
  );
}
