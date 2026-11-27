import { primaryButtonClass, secondaryButtonClass, inputClass } from "@/styles/uiStyles";
import type { AccessLink } from "./useUserManagement";

/** Enllaç d'accés d'un sol ús: només es pot copiar mentre és aquí. */
export function AccessLinkPanel({
  link,
  onCopy,
  onClose,
}: {
  link: AccessLink;
  onCopy: (url: string) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="border border-primary rounded-lg p-3 mb-3 bg-soft">
      <div className="text-sm font-semibold mb-1">Enllaç d'accés · {link.username}</div>
      <p className="m-0 mb-2 text-sm text-muted">
        Envia'l per un canal privat (WhatsApp, Telegram o en mà). Caduca el{" "}
        {new Date(link.expires_at).toLocaleString()} i només es pot fer servir un cop.
      </p>
      <input
        readOnly
        value={link.url}
        onFocus={(e) => e.currentTarget.select()}
        className={`${inputClass} bg-white`}
      />
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => {
            void onCopy(link.url);
          }}
          className={`${primaryButtonClass} flex-1`}
        >
          Copiar enllaç
        </button>
        <button
          type="button"
          onClick={onClose}
          className={`${secondaryButtonClass} flex-1`}
        >
          Tanca
        </button>
      </div>
    </div>
  );
}
