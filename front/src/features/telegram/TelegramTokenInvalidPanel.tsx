import { PasswordInput } from "@/shared/ui/PasswordInput";
import { inputClass, primaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";

/** El grup segueix vinculat; només cal tornar a validar el bot amb un token nou. */
export function TelegramTokenInvalidPanel({
  botName,
  botUsername,
  groupName,
  tokenInput,
  registerPending,
  onTokenChange,
  onRegister,
}: {
  botName?: string;
  botUsername?: string;
  groupName?: string;
  tokenInput: string;
  registerPending: boolean;
  onTokenChange: (value: string) => void;
  onRegister: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <p className="m-0 text-sm text-muted leading-snug">
        Bot: <strong>{botName ?? botUsername ?? "desconegut"}</strong>
        {botUsername ? ` (@${botUsername})` : ""}
        {groupName ? (
          <>
            {" · "}Grup: <strong>{groupName}</strong>
          </>
        ) : null}
      </p>
      <p className="m-0 text-sm text-muted leading-snug">
        Obre <strong>@BotFather</strong>, escriu <em>/token</em> i tria aquest bot per recuperar el
        token. Enganxa'l aquí: si és el mateix bot, el grup es manté vinculat i podràs enviar
        missatges de seguida.
      </p>
      <PasswordInput
        value={tokenInput}
        onChange={(e) => onTokenChange(e.target.value)}
        placeholder="123456789:AAF..."
        className={inputClass}
        autoComplete="off"
      />
      <button
        onClick={onRegister}
        disabled={registerPending}
        className={`${primaryButtonClass} w-full`}
        title="Torna a validar el token del bot"
      >
        <ActionGlyph name="key" />
        {registerPending ? "Validant..." : "Tornar a validar el bot"}
      </button>
    </div>
  );
}
