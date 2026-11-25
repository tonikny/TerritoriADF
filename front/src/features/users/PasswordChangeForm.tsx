import type { FormEvent } from "react";

import { PasswordInput } from "@/shared/ui/PasswordInput";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/styles/uiStyles";
import type { PasswordDraft } from "./useUserManagement";

/** Canvi de la contrasenya pròpia: el backend demana la contrasenya actual. */
export function PasswordChangeForm({
  username,
  minPasswordLength,
  draft,
  submitting,
  onChange,
  onSubmit,
  onCancel,
}: {
  username: string;
  minPasswordLength: number;
  draft: PasswordDraft;
  submitting: boolean;
  onChange: (patch: Partial<PasswordDraft>) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      className="border-t border-primary bg-soft p-3"
    >
      <div className="text-[0.8rem] font-semibold mb-2">Canviar contrasenya · {username}</div>
      <label className="block text-[0.8rem] italic mb-2">
        Contrasenya actual:
        <PasswordInput
          autoComplete="current-password"
          value={draft.current}
          onChange={(e) => onChange({ current: e.target.value })}
          className={`${inputClass} bg-white`}
          required
        />
      </label>
      <label className="block text-[0.8rem] italic mb-2">
        Nova contrasenya:
        <PasswordInput
          autoComplete="new-password"
          minLength={minPasswordLength}
          value={draft.next}
          onChange={(e) => onChange({ next: e.target.value })}
          className={`${inputClass} bg-white`}
          required
        />
      </label>
      <label className="block text-[0.8rem] italic mb-2">
        Repeteix la nova contrasenya:
        <PasswordInput
          autoComplete="new-password"
          minLength={minPasswordLength}
          value={draft.repeat}
          onChange={(e) => onChange({ repeat: e.target.value })}
          className={`${inputClass} bg-white`}
          required
        />
      </label>
      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          disabled={submitting}
          className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
        >
          {submitting ? "Guardant..." : "Guardar"}
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
