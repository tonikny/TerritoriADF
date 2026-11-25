import { PasswordInput } from "@/shared/ui/PasswordInput";
import { inputClass, primaryButtonClass } from "@/styles/uiStyles";
import { StepNumber } from "./StepNumber";
import { botUsernameExample } from "./telegramBot";

/**
 * `before-bot`: passos 1–3 actius i el 4 encara no disponible.
 * `before-link`: els passos 1–3 ja estan fets i el 4 és el que toca.
 */
export type TelegramStage = "before-bot" | "before-link";

function StepHeading({
  number,
  muted,
  children,
}: {
  number: string;
  muted: boolean;
  children: string;
}) {
  return (
    <h5 className={muted ? "m-0 mb-1 font-semibold text-muted" : "m-0 mb-1 font-semibold"}>
      <StepNumber number={number} muted={muted} /> {children}
    </h5>
  );
}

/** Els quatre passos de l'assistent, amb el text de cada estat en un sol lloc. */
export function TelegramSteps({
  stage,
  groupAdf,
  adf,
  botName,
  botUsername,
  tokenInput,
  registerPending,
  linkUrl,
  linkPending,
  onTokenChange,
  onRegister,
  onLink,
}: {
  stage: TelegramStage;
  groupAdf: string;
  adf: { id: number; nom?: string };
  botName?: string;
  botUsername?: string;
  tokenInput: string;
  registerPending: boolean;
  linkUrl?: string;
  linkPending: boolean;
  onTokenChange: (value: string) => void;
  onRegister: () => void;
  onLink: () => void;
}) {
  const linked = stage === "before-link";

  return (
    <div className="border border-border rounded p-3">
      <ol className="m-0 p-0 list-none space-y-3 leading-relaxed">
        <li className={linked ? "text-muted" : undefined}>
          <StepHeading number="1" muted={linked}>
            Crea el grup de la teva ADF
          </StepHeading>
          {linked ? (
            <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
          ) : (
            <p className="m-0 text-[0.8rem] text-muted leading-snug">
              És el lloc on arribaran tots els avisos de l'aplicació (incidències, hidrants,
              edicions). Crea'l a Telegram: botó <strong>Nou grup</strong> → tria un nom (per
              exemple <em>{groupAdf} Avisos</em>) i afegeix-hi els membres. Necessitaràs ser
              administrador per afegir-hi el bot.
            </p>
          )}
        </li>

        <li className={linked ? "text-muted" : undefined}>
          <StepHeading number="2" muted={linked}>
            Crea el bot de la teva ADF
          </StepHeading>
          {linked ? (
            <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
          ) : (
            <p className="m-0 text-[0.8rem] text-muted leading-snug">
              El bot és la identitat que enviarà cada notificació de <strong>{groupAdf}</strong> al
              grup; cada ADF en té un de propi. A Telegram, escriu a <strong>@BotFather</strong> →{" "}
              <strong>/newbot</strong>. Et demanarà dos noms: el <strong>nom</strong> (com es veurà
              al grup, per exemple <em>{groupAdf} · Bot d'avisos</em>) i el{" "}
              <strong>nom d'usuari</strong>, que ha d'acabar en <em>bot</em> (per exemple{" "}
              <em>{botUsernameExample(adf)}</em>). BotFather et donarà un <strong>token</strong>.
            </p>
          )}
        </li>

        <li className={linked ? "text-muted" : undefined}>
          <StepHeading number="3" muted={linked}>
            Introdueix el token
          </StepHeading>
          {linked ? (
            <p className="m-0 text-[0.8rem] text-muted">
              ✅ Bot configurat:
              {botName ? ` ${botName}` : ""} {botUsername ? `(@${botUsername})` : ""}.
            </p>
          ) : (
            <>
              <p className="m-0 mb-2 text-[0.8rem] text-muted">
                Enganxa aquí el token de <strong>@BotFather</strong> i prem{" "}
                <strong>Validar bot</strong>. El token és una contrasenya: es guarda xifrat i no
                s'ha de compartir amb ningú.
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
            </>
          )}
        </li>

        <li className={linked ? undefined : "text-muted"}>
          <StepHeading number="4" muted={!linked}>
            Vincula el grup de la teva ADF
          </StepHeading>
          {linked ? (
            <>
              <p className="m-0 mb-2 text-[0.8rem] text-muted leading-snug">
                Prem el botó i a Telegram escull el grup de <strong>{groupAdf}</strong> que has
                creat al pas 1. Has de ser administrador per afegir-hi el bot. L'enllaç té un codi
                d'un sol ús (caduca als 15 minuts) i la vinculació es fa tota sola. Si algun dia es
                treu el bot del grup, aquest pas tornará a aparèixer per re-vincular-lo sense
                crear-ne un de nou.
              </p>
              <button
                onClick={onLink}
                disabled={linkPending}
                className={`${primaryButtonClass} w-full`}
                title="Obre Telegram per afegir el bot al grup de la teva ADF"
              >
                {linkPending ? "⏳ Generant enllaç..." : "📎 Vincular grup de Telegram"}
              </button>
              {linkUrl && (
                <a
                  href={linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 text-[0.8rem] text-blue-600 underline"
                >
                  Si no s'ha obert Telegram, toca aquí
                </a>
              )}
            </>
          ) : (
            <p className="m-0 text-[0.8rem] text-muted">
              Un cop el bot sigui vàlid et donarem un enllaç d'un sol ús per afegir-lo al grup
              (caduca als 15 minuts). Encara no disponible: primer valida el bot.
            </p>
          )}
        </li>
      </ol>
    </div>
  );
}
