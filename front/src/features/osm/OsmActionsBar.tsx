import { ActionGlyph } from "@/shared/ui/Glyphs";

/** Accions per lots: només apareixen quan hi ha selecció. */
export function OsmActionsBar({
  count,
  disabled,
  onPush,
  onDiscard,
}: {
  count: number;
  disabled: boolean;
  onPush: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex gap-2 px-3 py-2 border-t border-border bg-bg">
      <button
        onClick={onPush}
        disabled={disabled}
        className="inline-flex flex-1 items-center justify-center gap-1 min-h-8 text-sm px-2 py-1 bg-primary text-white border border-primary-hover rounded-md cursor-pointer disabled:opacity-50"
      >
        <ActionGlyph name="arrowUp" />
        Pujar ({count})
      </button>
      <button
        onClick={onDiscard}
        disabled={disabled}
        className="inline-flex flex-1 items-center justify-center gap-1.5 min-h-8 text-sm px-2 py-1 bg-white text-ink border border-border-strong rounded-md cursor-pointer disabled:opacity-50"
      >
        Descartar ({count})
      </button>
    </div>
  );
}
