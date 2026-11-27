import type { HidrantUiFields } from "@territoriadf/contracts/hidrants";
import { HidrantFormFields } from "./HidrantFormFields";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  dangerButtonClass,
} from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";

export function HidrantEditForm({
  data,
  setData,
  observacions,
  setObservacions,
  busy,
  onSave,
  onCancel,
  onDelete,
}: {
  data: HidrantUiFields;
  setData: (d: HidrantUiFields) => void;
  observacions: string;
  setObservacions: (o: string) => void;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm flex flex-col gap-1 rounded-lg text-center text-ink bg-accent px-2 py-1">
        Pots arrossegar el node per corregir la posició del hidrant
      </div>
      <HidrantFormFields data={data} onChange={setData} showSurveyDateAndStatus={true} />

      <label className="text-sm text-muted flex flex-col gap-1">
        Observacions:
        <textarea
          value={observacions}
          onChange={(e) => setObservacions(e.target.value)}
          rows={3}
          className={`${inputClass} w-full resize-y`}
          placeholder="Observacions de servei de l'hidrant..."
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          disabled={busy}
          className={`${primaryButtonClass} flex-1 disabled:opacity-70`}
        >
          {busy ? "Guardant..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className={`${secondaryButtonClass} flex-1`}
        >
          Cancel·lar
        </button>
      </div>

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={busy}
          className={`${dangerButtonClass} disabled:opacity-70`}
        >
          <ActionGlyph name="trash" />
          Esborrar hidrant
        </button>
      )}
    </div>
  );
}
