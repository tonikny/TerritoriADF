import { useState } from "react";
import { FONT_SCALES, getFontScale, setFontScale } from "@/utils/fontScale";
import { compactSelectClass } from "@/styles/uiStyles";
import { CollapsibleSection } from "@/shared/ui/CollapsibleSection";
import { Glyph } from "@/shared/ui/Glyphs";
import { TelegramConfigPanel } from "@/features/telegram/TelegramConfigPanel";
import { ENGINE_LABELS } from "@/map/core/capabilities";
import { detectWebgl2 } from "@/map/core/engineSelection";
import type { EngineId } from "@/map/core/types";
import type { EnginePreference } from "@/map/core/engineSelection";

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
  const scaleIndex = Math.max(
    0,
    FONT_SCALES.findIndex((s) => s.value === fontScale),
  );
  const webgl2 = detectWebgl2();

  return (
    <div className="p-4 space-y-4">
      <h3 className="panel-title mb-3">Ajustos</h3>
      <CollapsibleSection title="Aparença" icon={<Glyph name="palette" />}>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span>Mida de text</span>
            <span className="text-muted">
              {FONT_SCALES.find((s) => s.value === fontScale)?.label ?? "Normal"}
            </span>
          </div>
          <div className="flex flex-col">
            <input
              type="range"
              min={0}
              max={FONT_SCALES.length - 1}
              step={1}
              value={scaleIndex}
              onChange={(e) => {
                const v = FONT_SCALES[Number(e.target.value)]?.value ?? 1;
                setFontScaleValue(v);
                setFontScale(v);
              }}
              aria-label="Mida de text"
              className="w-full accent-primary"
            />
            {/* Una marca per posició vàlida: el `range` natiu no ensenya on
                cauen els passos, i el thumb és més estret que el track. */}
            <div aria-hidden className="pointer-events-none flex justify-between px-2 mt-0.5">
              {FONT_SCALES.map((s, i) => (
                <span
                  key={s.value}
                  className={`h-1 w-1 rounded-full ${
                    i === scaleIndex ? "bg-primary" : "bg-border-strong/60"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {onEngineChange && (
        <CollapsibleSection title="Motor de mapa" icon={<Glyph name="engine" />}>
          <label className="flex items-center justify-between gap-2 text-sm">
            <span>Motor</span>
            <select
              value={enginePreference ?? "auto"}
              onChange={(e) => onEngineChange(e.target.value as EnginePreference)}
              className={compactSelectClass}
            >
              <option value="auto">Automàtic</option>
              <option value="maplibre" disabled={!webgl2}>
                MapLibre
              </option>
              <option value="leaflet">Leaflet</option>
            </select>
          </label>
          <p className="text-sm text-muted mt-1">
            Motor actiu: {engine ? ENGINE_LABELS[engine] : "—"}.
            {webgl2
              ? " Aquest dispositiu suporta WebGL2."
              : " Aquest dispositiu no té WebGL2: s'usa Leaflet."}
          </p>
        </CollapsibleSection>
      )}

      <TelegramConfigPanel />
    </div>
  );
}
