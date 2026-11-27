import { CollapsibleSection } from "@/shared/ui/CollapsibleSection";
import { ActionGlyph } from "@/shared/ui/Glyphs";
import { secondaryButtonClass } from "@/styles/uiStyles";

/** Reconfigurar l'app: tornar a activar, carregar la configuració o baixar el .otrc. */
export function TrackingConfigSection({
  loading,
  onEnable,
  onLoadConfig,
  onDownloadConfig,
}: {
  loading: boolean;
  onEnable: () => void;
  onLoadConfig: () => void;
  onDownloadConfig: () => void;
}) {
  return (
    <CollapsibleSection title="Tornar a configurar l'app">
      {/* Cada tipus d'acció en el seu bloc, separat per una línia. */}
      <div className="divide-y divide-soft">
        <div className="space-y-2 py-3 first:pt-0">
          <p className="m-0 text-sm text-muted">
            Si la configuració no es pot desxifrar (per exemple si ha canviat la clau de xifrat del
            servidor), torna a activar per generar credencials noves:
          </p>
          <button
            onClick={onEnable}
            disabled={loading}
            className={`${secondaryButtonClass} w-full`}
            title="Genera credencials noves i torna a desar la contrasenya xifrada"
          >
            <ActionGlyph name="refresh" />
            {loading ? "Activant..." : "Tornar a activar"}
          </button>
        </div>

        <div className="space-y-2 py-3">
          <p className="m-0 text-sm text-muted">
            Si has canviat de mòbil o les credencials no funcionen, carrega la configuració
            directament a OwnTracks:
          </p>
          <button
            onClick={onLoadConfig}
            disabled={loading}
            className={`${secondaryButtonClass} w-full`}
            title="Obre OwnTracks amb la configuració ja carregada"
          >
            <ActionGlyph name="settings" />
            {loading ? "Carregant..." : "Carregar configuració"}
          </button>
          <p className="m-0 text-sm text-muted">
            Només per carregar la configuració (o per obrir un <strong>.otrc</strong>) cal tenir
            activat <strong>«Permet configuració externa»</strong> (en anglès «Allow external
            configuration») a OwnTracks (Ajustos → Avançat); a les versions noves ve desactivat per
            seguretat. Ni «Tornar a activar» ni la descàrrega del fitxer no ho necessiten.
          </p>
        </div>

        <div className="space-y-2 py-3 last:pb-0">
          <p className="m-0 text-sm text-muted">
            Alternativa: baixa el fitxer <strong>.otrc</strong> amb les teves credencials (són
            personals, no les comparteixis):
          </p>
          <button
            onClick={onDownloadConfig}
            disabled={loading}
            className={`${secondaryButtonClass} w-full`}
            title="Descarrega el fitxer de configuració OwnTracks"
          >
            <ActionGlyph name="download" />
            Baixar credencials
          </button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
