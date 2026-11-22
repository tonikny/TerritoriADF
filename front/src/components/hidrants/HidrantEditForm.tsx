import type { HidrantUiFields } from "@territoriadf/contracts/hidrants";
import { HidrantFormFields } from "./HidrantFormFields";
import {
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
  dangerButtonClass,
} from "../../styles/uiStyles";

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
      <div className="text-[0.8rem] italic flex flex-col gap-1 rounded-md text-center text-yellow-300 bg-gray-400">
        Pots arrossegar el node per corregir la posició del hidrant
      </div>
      <HidrantFormFields data={data} onChange={setData} showSurveyDateAndStatus={true} />

      <label className="text-[0.8rem] italic flex flex-col gap-1">
        Observacions:
        <textarea
          value={observacions}
          onChange={(e) => setObservacions(e.target.value)}
          rows={3}
          className={`${inputClass} w-full resize-y text-[0.8rem] p-1.5`}
          placeholder="Observacions internes de l'hidrant..."
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
          className={`${primaryButtonClass} flex-1 py-2 text-[0.8rem] disabled:opacity-70`}
        >
          {busy ? "Guardant..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className={`${secondaryButtonClass} flex-1 py-2 text-[0.8rem]`}
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
          🗑️ Esborrar hidrant
        </button>
      )}
    </div>
  );
}
