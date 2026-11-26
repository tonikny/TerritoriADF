import { primaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";

/** Passos per instal·lar OwnTracks i activar l'usuari (encara no activat). */
export function SeguimentSetupSteps({
  loading,
  onEnable,
}: {
  loading: boolean;
  onEnable: () => void;
}) {
  return (
    <ol className="m-0 p-0 list-none space-y-3 text-sm leading-relaxed">
      <li>
        <h4 className="m-0 mb-1 text-sm font-semibold">
          <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-xs align-middle">
            1
          </span>
          Instal·la l'app OwnTracks
        </h4>
        <p className="m-0 mb-2 text-sm text-muted">Tria la tenda segons la teva plataforma:</p>
        <div className="flex gap-2">
          <a
            href="https://play.google.com/store/apps/details?id=org.owntracks.android"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex flex-col items-center gap-0.5 border border-border rounded-lg p-2 no-underline text-center hover:bg-soft"
          >
            <span className="text-[1.3rem]">📱</span>
            <span className="text-sm font-semibold text-ink">Android</span>
            <span className="text-xs text-muted">Google Play</span>
          </a>
          <a
            href="https://apps.apple.com/app/owntracks/id692424691"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex flex-col items-center gap-0.5 border border-border rounded-lg p-2 no-underline text-center hover:bg-soft"
          >
            <span className="text-[1.3rem]">🍏</span>
            <span className="text-sm font-semibold text-ink">iPhone</span>
            <span className="text-xs text-muted">App Store</span>
          </a>
        </div>
        <p className="text-xs text-muted mt-1 mb-0">
          Perquè l'app funcioni bé, concedeix-li els permisos de localització precisa i desactiva
          l'optimització de bateria perquè no s'aturi sola.
        </p>
      </li>
      <li>
        <h4 className="m-0 mb-1 text-sm font-semibold">
          <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-xs align-middle">
            2
          </span>
          Activa el seguiment
        </h4>
        <p className="m-0 mb-2 text-sm text-muted">
          Genera les teves credencials personals i habilita la recepció de posicions:
        </p>
        <button
          onClick={onEnable}
          disabled={loading}
          className={`${primaryButtonClass} w-full`}
          title="Activa OwnTracks i genera credencials"
        >
          <ActionGlyph name="plus" />
          {loading ? "Activant..." : "Activar"}
        </button>
      </li>
      <li>
        <h4 className="m-0 mb-1 text-sm font-semibold">
          <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-xs align-middle">
            3
          </span>
          Importa les credencials
        </h4>
        <p className="m-0 text-sm text-muted">
          Un cop activat apareixerà <strong>Tornar a configurar l'app</strong> per carregar la
          configuració directament a OwnTracks o baixar el fitxer <strong>.otrc</strong>. El fitxer
          conté les teves credencials: <strong>no el comparteixis amb ningú</strong>. Per començar a
          compartir la posició, obre OwnTracks al mòbil: el navegador no pot obrir-la.
        </p>
      </li>
      <li>
        <h4 className="m-0 mb-1 text-sm">
          <span className="inline-flex items-center justify-center w-4.5 h-4.5 mr-1 rounded-full bg-primary text-white text-xs align-middle">
            4
          </span>
          Comparteix la teva posició
        </h4>
        <p className="m-0 text-sm text-muted">
          Per aparèixer al mapa, obre OwnTracks i deixa-la oberta (pot funcionar en segon plà, amb
          la pantalla bloquejada). Quan la tanquis ("Sortir" al menú), deixaràs de compartir la teva
          posició.
        </p>
      </li>
    </ol>
  );
}
