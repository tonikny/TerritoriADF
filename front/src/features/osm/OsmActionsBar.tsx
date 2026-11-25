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
        className="flex-1 text-[0.8rem] px-2 py-1.5 bg-blue-600 text-white border border-blue-700 rounded cursor-pointer disabled:opacity-50"
      >
        Pujar ({count})
      </button>
      <button
        onClick={onDiscard}
        disabled={disabled}
        className="flex-1 text-[0.8rem] px-2 py-1.5 bg-white text-ink border border-border rounded cursor-pointer disabled:opacity-50"
      >
        Descartar ({count})
      </button>
    </div>
  );
}
