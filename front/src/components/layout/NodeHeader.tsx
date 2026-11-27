import { Glyph } from "@/shared/ui/Glyphs";

const buttonClass =
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-transparent border-0 cursor-pointer text-sm font-medium text-ink/80 hover:text-ink";

/** Accions de la capçalera: les mateixes icones d'acció que la resta de l'app. */
function Icon({ kind }: { kind: "edit" | "close" }) {
  return <Glyph name={kind} size={18} strokeWidth={2.2} />;
}

export function NodeHeader({
  onEdit,
  onClose,
  title,
  editing,
}: {
  onEdit?: () => void;
  onClose?: () => void;
  title?: string;
  editing?: boolean;
}) {
  const handleEditClick = () => {
    if (!onEdit) {
      return;
    }
    onEdit();
  };

  const handleCloseClick = () => {
    if (!onClose) {
      return;
    }
    onClose();
  };

  return (
    <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-1 bg-accent text-ink">
      <span className="min-w-0 truncate font-semibold text-base">
        {title ?? "Informació del node"}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {editing ? (
          onEdit && (
            <button type="button" onClick={handleEditClick} className={buttonClass}>
              <Icon kind="close" />
              Tancar
            </button>
          )
        ) : (
          <>
            {onEdit && (
              <button type="button" onClick={handleEditClick} className={buttonClass}>
                <Icon kind="edit" />
                Editar
              </button>
            )}
            {onClose && (
              <button type="button" onClick={handleCloseClick} className={buttonClass}>
                <Icon kind="close" />
                Tancar
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
