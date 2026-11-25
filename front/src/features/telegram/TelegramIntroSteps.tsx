import { PasswordInput } from "@/shared/ui/PasswordInput";
import { inputClass, primaryButtonClass } from "@/styles/uiStyles";
import { StepNumber } from "./StepNumber";
import { botUsernameExample } from "./telegramBot";

/** Passos 1–3 mentre el bot encara no s'ha validat; el 4 queda velat. */
export function TelegramIntroSteps({
  groupAdf,
  adf,
  tokenInput,
  registerPending,
  onTokenChange,
  onRegister,
}: {
  groupAdf: string;
  adf: { id: number; nom?: string };
  tokenInput: string;
  registerPending: boolean;
  onTokenChange: (value: string) => void;
  onRegister: () => void;
}) {
  return (
    <div className="border border-border rounded p-3">
      <ol className="m-0 p-0 list-none space-y-3 leading-relaxed">
        <li>
          <h5 className="m-0 mb-1 font-semibold">
            <StepNumber number="1" /> Crea el grup de la teva ADF
          </h5>
          <p className="m-0 text-[0.8rem] text-muted leading-snug">
            És el lloc on arribaran tots els avisos de l'aplicació (incidències, hidrants,
            edicions). Crea'l a Telegram: botó <strong>Nou grup</strong> → tria un nom (per exemple{" "}
            <em>{groupAdf} Avisos</em>) i afegeix-hi els membres. Necessitaràs ser administrador per
            afegir-hi el bot.
          </p>
        </li>
        <li>
          <h5 className="m-0 mb-1 font-semibold">
            <StepNumber number="2" /> Crea el bot de la teva ADF
          </h5>
          <p className="m-0 text-[0.8rem] text-muted leading-snug">
            El bot és la identitat que enviarà cada notificació de <strong>{groupAdf}</strong> al
            grup; cada ADF en té un de propi. A Telegram, escriu a <strong>@BotFather</strong> →{" "}
            <strong>/newbot</strong>. Et demanarà dos noms: el <strong>nom</strong> (com es veurà al
            grup, per exemple <em>{groupAdf} · Bot d'avisos</em>) i el <strong>nom d'usuari</strong>
            , que ha d'acabar en <em>bot</em> (per exemple <em>{botUsernameExample(adf)}</em>).
            BotFather et donarà un <strong>token</strong>.
          </p>
        </li>
        <li>
          <h5 className="m-0 mb-1 font-semibold">
            <StepNumber number="3" /> Introdueix el token
          </h5>
          <p className="m-0 mb-2 text-[0.8rem] text-muted">
            Enganxa aquí el token de <strong>@BotFather</strong> i prem <strong>Validar bot</strong>
            . El token és una contrasenya: es guarda xifrat i no s'ha de compartir amb ningú.
          </p>
          <PasswordInput
            value={tokenInput}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="123456789:AAF..."
            className={`${inputClass} px-2`}
            autoComplete="off"
          />
          <button
            onClick={onRegister}
            disabled={registerPending}
            className={`${primaryButtonClass} w-full mt-2`}
            title="Valida el token contra Telegram i activa el bot"
          >
            {registerPending ? "⏳ Validant..." : "🆔 Validar bot"}
          </button>
        </li>
        <li className="text-muted">
          <h5 className="m-0 mb-1 font-semibold text-muted">
            <StepNumber number="4" muted /> Vincula el grup de la teva ADF
          </h5>
          <p className="m-0 text-[0.8rem] text-muted">
            Un cop el bot sigui vàlid et donarem un enllaç d'un sol ús per afegir-lo al grup (caduca
            als 15 minuts). Encara no disponible: primer valida el bot.
          </p>
        </li>
      </ol>
    </div>
  );
}
