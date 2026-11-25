import type { FormEvent } from "react";

import { adfLabel } from "@/utils/adfLabel";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/styles/uiStyles";
import type { AdfDraft, DraftMode } from "./adfDraft";

/** Alta i edició comparteixen camps; només canvia el número (fix a l'edició). */
export function AdfDraftForm({
  mode,
  draft,
  submitting,
  onChange,
  onSubmit,
  onCancel,
}: {
  mode: DraftMode;
  draft: AdfDraft;
  submitting: boolean;
  onChange: (patch: Partial<AdfDraft>) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="border border-primary rounded p-3 mt-2 bg-soft"
    >
      <div className="text-[0.8rem] font-semibold mb-2">
        {mode === "create" ? "Nova ADF" : `Modificar ${adfLabel(Number(draft.numero), draft.nom)}`}
      </div>
      <label className="block text-[0.8rem] italic mb-2">
        Número d'ADF:
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={draft.numero}
          disabled={mode === "edit"}
          onChange={(e) => onChange({ numero: e.target.value.replace(/\D/g, "").slice(0, 3) })}
          placeholder="---"
          className={`${inputClass} bg-white px-2 disabled:bg-soft disabled:text-muted`}
          required
        />
      </label>
      <label className="block text-[0.8rem] italic mb-2">
        Nom:
        <input
          type="text"
          value={draft.nom}
          onChange={(e) => onChange({ nom: e.target.value })}
          placeholder="ADF ..."
          className={`${inputClass} bg-white px-2`}
          required
        />
      </label>
      <label className="block text-[0.8rem] italic mb-1">
        Relacions OSM:
        <input
          type="text"
          value={draft.relations}
          onChange={(e) => onChange({ relations: e.target.value })}
          placeholder="R345695, R345699"
          className={`${inputClass} bg-white px-2`}
          required
        />
      </label>
      <p className="m-0 mb-2 text-[0.7rem] text-muted">
        Separa les relacions per comes. Els límits territorials es calculen automàticament en desar.
      </p>
      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          disabled={submitting}
          className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
        >
          {submitting ? "Guardant..." : mode === "create" ? "Crear" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
        >
          Cancel·la
        </button>
      </div>
    </form>
  );
}
