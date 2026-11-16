const DEFAULT_DELAY_MS = 800;
const DEFAULT_TOLERANCE_PX = 10;

let lastLongPressAt = 0;

export function markLongPress(): void {
  lastLongPressAt = Date.now();
}

/** Evita el `contextmenu` que alguns navegadors disparen després d'una pulsació llarga. */
export function isRecentLongPress(windowMs = 1_200): boolean {
  return Date.now() - lastLongPressAt < windowMs;
}

/**
 * Pulsació llarga d'un dit sobre el contenidor del mapa. Cancel·la si el dit
 * es mou més de `tolerancePx` (és un drag) o si apareix un segon dit (pinch).
 */
export function attachLongPress(
  container: HTMLElement,
  onLongPress: (clientX: number, clientY: number) => void,
  delayMs = DEFAULT_DELAY_MS,
  tolerancePx = DEFAULT_TOLERANCE_PX,
): () => void {
  let timer: number | null = null;
  let start: { x: number; y: number } | null = null;

  const clear = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    start = null;
  };

  const handleStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      clear();
      return;
    }
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY };
    timer = window.setTimeout(() => {
      if (!start) {
        return;
      }
      markLongPress();
      onLongPress(start.x, start.y);
      start = null;
      timer = null;
    }, delayMs);
  };

  const handleMove = (event: TouchEvent) => {
    if (!start) {
      return;
    }
    const touch = event.touches[0];
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > tolerancePx) {
      clear();
    }
  };

  const handleEnd = () => {
    clear();
  };

  container.addEventListener("touchstart", handleStart, { passive: true });
  container.addEventListener("touchmove", handleMove, { passive: true });
  container.addEventListener("touchend", handleEnd);
  container.addEventListener("touchcancel", handleEnd);

  return () => {
    clear();
    container.removeEventListener("touchstart", handleStart);
    container.removeEventListener("touchmove", handleMove);
    container.removeEventListener("touchend", handleEnd);
    container.removeEventListener("touchcancel", handleEnd);
  };
}
