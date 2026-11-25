import { useEffect, useRef, type ReactNode } from "react";

/**
 * Informa si el contingut és visible al viewport. El panell de Telegram només
 * polla l'estat mentre és obert i visible; d'aquesta manera, en col·lapsar-lo o
 * tancar el bottom sheet no es fan crides.
 */
export function VisibleObserver({
  onVisibilityChange,
  children,
}: {
  onVisibilityChange: (visible: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver((entries) =>
      onVisibilityChange(entries[0]?.isIntersecting ?? false),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onVisibilityChange]);

  return <div ref={ref}>{children}</div>;
}
