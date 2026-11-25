import {
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/styles/uiStyles";

/** Telegram configurat: enviar un missatge, canviar de grup o desconnectar. */
export function TelegramConfiguredPanel({
  groupName,
  botUsername,
  customMsg,
  sendPending,
  linkPending,
  removePending,
  onMessageChange,
  onSend,
  onLink,
  onRemove,
}: {
  groupName?: string;
  botUsername?: string;
  customMsg: string;
  sendPending: boolean;
  linkPending: boolean;
  removePending: boolean;
  onMessageChange: (value: string) => void;
  onSend: () => void;
  onLink: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-border rounded p-3 space-y-3">
      <p className="m-0 text-[0.85rem]">
        ✅ <strong>Grup vinculat:</strong> {groupName ?? "desconegut"}
        {botUsername ? ` (bot @${botUsername})` : ""}
      </p>
      <div className="space-y-1">
        <input
          type="text"
          value={customMsg}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Escriu el missatge que vols enviar al grup..."
          className={`${inputClass} px-2`}
          autoComplete="off"
        />
        <button
          onClick={onSend}
          disabled={sendPending || customMsg.trim() === ""}
          className={`${primaryButtonClass} w-full`}
          title="Envia el missatge al grup a través del bot"
        >
          {sendPending ? "⏳ Enviant..." : "📨 Enviar missatge al grup"}
        </button>
        <p className="m-0 text-[0.75rem] text-muted">
          Tot el que escriguis aquí es publicarà al grup a través del bot d'aquesta ADF.
        </p>
      </div>
      <div className="space-y-1">
        <button
          onClick={onLink}
          disabled={linkPending}
          className={`${secondaryButtonClass} w-full`}
          title="Genera un enllaç nou per canviar el grup"
        >
          {linkPending ? "⏳ Generant enllaç..." : "🔄 Canviar el grup"}
        </button>
        <p className="m-0 text-[0.75rem] text-muted">
          Canvia el grup de destí sense crear un bot nou: generaràs un enllaç d'un sol ús nou.
        </p>
      </div>
      <div className="space-y-1">
        <button
          onClick={onRemove}
          disabled={removePending}
          className={`${dangerButtonClass}`}
          title="Desconnecta Telegram d'aquesta ADF"
        >
          {removePending ? "⏳ Desconnectant..." : "⛔ Desconnectar Telegram"}
        </button>
        <p className="m-0 text-[0.75rem] text-muted">
          Deixa de rebre notificacions al grup i esborra la configuració. Podràs tornar a
          configurar-ho des de zero.
        </p>
      </div>
    </div>
  );
}
