import type { FormEvent } from "react";

import { primaryButtonClass, secondaryButtonClass, selectClass } from "@/styles/uiStyles";
import { prefixFor } from "./userIdentity";
import type { UserDraft } from "./useUserManagement";

/** Camp de tres xifres: només dígits, alineat amb el prefix de l'ADF. */
function NumeroField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
      placeholder="---"
      className="border border-border rounded-md text-base font-semibold w-[4ch] text-center py-0.5 bg-white"
    />
  );
}

/** Formulari compartit d'alta i edició: canvia el títol, no els camps. */
export function UserDraftForm({
  title,
  adfId,
  draft,
  roles,
  submitting,
  submitLabel,
  className,
  footnote,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  adfId: number;
  draft: UserDraft;
  roles: readonly string[];
  submitting: boolean;
  submitLabel: string;
  className: string;
  footnote?: string;
  onChange: (patch: Partial<UserDraft>) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className={className}
    >
      <div className="text-sm font-semibold mb-2">{title}</div>
      <label className="block text-sm text-muted mb-2">
        Número:
        <div className="flex gap-2 items-center mt-0.5">
          <span className="text-base font-semibold whitespace-nowrap">
            {prefixFor(adfId, draft.gi)}
          </span>
          <NumeroField value={draft.numero} onChange={(v) => onChange({ numero: v })} />
        </div>
      </label>
      <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={draft.gi}
          onChange={(e) => onChange({ gi: e.target.checked })}
        />
        Grup d'Intervenció (GI)
      </label>
      <label className="block text-sm text-muted mb-2">
        Rol:
        <select
          value={draft.role}
          onChange={(e) => onChange({ role: e.target.value })}
          className={selectClass}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {footnote && <p className="m-0 mb-2 text-sm text-muted">{footnote}</p>}
      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          disabled={submitting}
          className={`${primaryButtonClass} flex-1 disabled:opacity-70`}
        >
          {submitting ? "Guardant..." : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={`${secondaryButtonClass} flex-1`}>
          Cancel·la
        </button>
      </div>
    </form>
  );
}
