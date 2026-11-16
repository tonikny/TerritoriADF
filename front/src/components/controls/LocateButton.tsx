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
      🛰️
      {tracking && (
        <span className="w-2 h-2 rounded-full bg-[#22c55e] border-[1.5px] border-white absolute top-0.25 right-0.25" />
      )}
    </button>
  );
}
