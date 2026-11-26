import { Glyph } from "@/shared/ui/Glyphs";

export function LocateButton({
  className,
  tracking,
  onToggle,
}: Readonly<{
  className?: string;
  tracking: boolean;
  onToggle: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${className || ""} relative`}
      title={
        tracking
          ? "Desactiva el seguiment de la teva posició"
          : "Activa el seguiment de la teva posició"
      }
    >
      <Glyph
        name="locate"
        size={20}
        strokeWidth={2.1}
        className={tracking ? "text-primary" : "text-ink"}
      />
      {tracking && (
        <span className="w-2 h-2 rounded-full bg-ok border-[1.5px] border-white absolute top-0.25 right-0.25" />
      )}
    </button>
  );
}
