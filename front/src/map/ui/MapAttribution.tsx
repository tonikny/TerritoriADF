import { useLayoutEffect, useRef } from "react";

/** Espai reservat a l'esquerra perquè el text no arribi al control de zoom. */
const ZOOM_RESERVE_PX = 100;

export function MapAttribution({ lines }: { lines: readonly string[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const joined = lines.join(" | ");

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    const parent = container?.parentElement;

    if (!container || !measure || !parent) {
      return;
    }

    const updateLayout = () => {
      const available = parent.clientWidth - ZOOM_RESERVE_PX;
      const fits = lines.length < 2 || measure.getBoundingClientRect().width <= available;
      container.dataset.layout = fits ? "single" : "stacked";
    };

    updateLayout();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateLayout);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [joined, lines.length]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="map-attribution"
      data-layout="single"
      role="note"
      aria-label="Atribució del mapa"
    >
      <span ref={measureRef} className="map-attribution-measure" aria-hidden="true">
        {joined}
      </span>
      <span className="map-attribution-single">{joined}</span>
      <span className="map-attribution-stacked">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </div>
  );
}
