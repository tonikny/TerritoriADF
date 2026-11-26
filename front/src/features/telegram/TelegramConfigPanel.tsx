import { CollapsibleSection } from "@/shared/ui/CollapsibleSection";
import { Glyph } from "@/shared/ui/Glyphs";
import { TelegramConfiguredPanel } from "./TelegramConfiguredPanel";
import { TelegramSteps } from "./TelegramSteps";
import { TelegramTokenInvalidPanel } from "./TelegramTokenInvalidPanel";
import { useTelegramSetup } from "./useTelegramSetup";
import { VisibleObserver } from "./VisibleObserver";

/**
 * Configuració de les notificacions de Telegram: l'estat i les accions viuen a
 * `useTelegramSetup` i cada pas de l'assistent és un component a part.
 */
export function TelegramConfigPanel() {
  const s = useTelegramSetup();

  if (!s.user) {
    return (
      <div className="text-sm text-muted">
        Inicia sessió a la pestanya <strong>Usuaris</strong> per configurar les notificacions de
        Telegram.
      </div>
    );
  }

  if (!s.activeAdf) {
    return (
      <div className="text-sm text-muted">
        Selecciona una ADF a la pestanya <strong>ADF</strong> per gestionar les seves notificacions
        de Telegram.
      </div>
    );
  }

  const intro =
    s.canManage && s.status === "TOKEN_INVALID"
      ? "El bot i el grup continuen associats, però el token desat no es pot desxifrar (ha canviat la clau de xifrat del servidor). Torna a enganxar el token per reactivar les notificacions."
      : s.canManage && !s.configured
        ? "Les notificacions de l'ADF (noves incidències, altes i edicions d'hidrants) s'envien al grup de Telegram. Quatre passos i llest."
        : s.configured
          ? `Telegram està configurat per enviar notificacions de l'app${
              s.groupName ? ` al grup ${s.groupName}` : ""
            }.`
          : "Només els coordinadors de l'ADF poden modificar la configuració de Telegram.";

  return (
    <VisibleObserver onVisibilityChange={s.setVisible}>
      <CollapsibleSection
        title="Notificacions de Telegram"
        icon={<Glyph name="bell" />}
        open={s.telegramOpen}
        onToggle={s.toggleOpen}
      >
        <div className="space-y-3 text-sm">
          <p className="m-0 text-sm text-muted leading-snug">{intro}</p>

          {/* Token indesxifrable: el grup ja hi és, només cal tornar a validar el bot */}
          {s.canManage && s.status === "TOKEN_INVALID" && (
            <TelegramTokenInvalidPanel
              botName={s.botName}
              botUsername={s.botUsername}
              groupName={s.groupName}
              tokenInput={s.tokenInput}
              registerPending={s.pending.register}
              onTokenChange={s.setTokenInput}
              onRegister={() => {
                void s.register();
              }}
            />
          )}

          {/* Passos per al coordinador: l'1–3 mentre falta el bot, el 4 quan ja hi és */}
          {s.canManage && !s.configured && s.status !== "TOKEN_INVALID" && (
            <TelegramSteps
              stage={s.botReady ? "before-link" : "before-bot"}
              groupAdf={s.groupAdf}
              adf={s.activeAdf}
              botName={s.botName}
              botUsername={s.botUsername}
              tokenInput={s.tokenInput}
              registerPending={s.pending.register}
              linkUrl={s.linkUrl}
              linkPending={s.pending.link}
              onTokenChange={s.setTokenInput}
              onRegister={() => {
                void s.register();
              }}
              onLink={() => {
                void s.link();
              }}
            />
          )}

          {/* Configurat: ús + què significa cada botó */}
          {s.canManage && s.configured && (
            <TelegramConfiguredPanel
              groupName={s.groupName}
              botUsername={s.botUsername}
              customMsg={s.customMsg}
              sendPending={s.pending.send}
              linkPending={s.pending.link}
              removePending={s.pending.remove}
              onMessageChange={s.setCustomMsg}
              onSend={() => {
                void s.send();
              }}
              onLink={() => {
                void s.link();
              }}
              onRemove={() => {
                void s.remove();
              }}
            />
          )}
        </div>
      </CollapsibleSection>
    </VisibleObserver>
  );
}
