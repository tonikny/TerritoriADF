import { primaryButtonClass } from "@/styles/uiStyles";
import { StepNumber } from "./StepNumber";

/** Bot validat: els passos 1–3 queden fets i el 4 és el que toca. */
export function TelegramLinkStep({
  groupAdf,
  botName,
  botUsername,
  linkUrl,
  linkPending,
  onLink,
}: {
  groupAdf: string;
  botName?: string;
  botUsername?: string;
  linkUrl?: string;
  linkPending: boolean;
  onLink: () => void;
}) {
  return (
    <div className="border border-border rounded p-3">
      <ol className="m-0 p-0 list-none space-y-3 leading-relaxed">
        <li className="text-muted">
          <h5 className="m-0 mb-1 font-semibold text-muted">
            <StepNumber number="1" muted /> Crea el grup de la teva ADF
          </h5>
          <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
        </li>
        <li className="text-muted">
          <h5 className="m-0 mb-1 font-semibold text-muted">
            <StepNumber number="2" muted /> Crea el bot de la teva ADF
          </h5>
          <p className="m-0 text-[0.8rem] text-muted">Fet.</p>
        </li>
        <li className="text-muted">
          <h5 className="m-0 mb-1 font-semibold text-muted">
            <StepNumber number="3" muted /> Introdueix el token
          </h5>
          <p className="m-0 text-[0.8rem] text-muted">
            ✅ Bot configurat:
            {botName ? ` ${botName}` : ""} {botUsername ? `(@${botUsername})` : ""}.
          </p>
        </li>
        <li>
          <h5 className="m-0 mb-1 font-semibold">
            <StepNumber number="4" /> Vincula el grup de la teva ADF
          </h5>
          <p className="m-0 mb-2 text-[0.8rem] text-muted leading-snug">
            Prem el botó i a Telegram escull el grup de <strong>{groupAdf}</strong> que has creat al
            pas 1. Has de ser administrador per afegir-hi el bot. L'enllaç té un codi d'un sol ús
            (caduca als 15 minuts) i la vinculació es fa tota sola. Si algun dia es treu el bot del
            grup, aquest pas tornará a aparèixer per re-vincular-lo sense crear-ne un de nou.
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
        </li>
      </ol>
    </div>
  );
}
