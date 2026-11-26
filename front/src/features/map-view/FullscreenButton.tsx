import { useEffect, useState } from "react";
import { floatingButtonClass } from "@/styles/uiStyles";
import { Glyph } from "@/shared/ui/Glyphs";

export function FullscreenButton({
  targetId,
  className,
}: Readonly<{
  targetId: string;
  className?: string;
}>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const target = document.getElementById(targetId);
      setIsFullscreen(document.fullscreenElement === target);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [targetId]);

  const toggleFullscreen = () => {
    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    if (!document.fullscreenElement) {
      void target.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  return (
    <button
      onClick={toggleFullscreen}
      className={className || floatingButtonClass}
      title={isFullscreen ? "Sortir de pantalla completa" : "Pantalla completa"}
    >
      <Glyph name={isFullscreen ? "collapse" : "expand"} size={20} strokeWidth={2.1} />
    </button>
  );
}
