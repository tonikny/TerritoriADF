import type { LatLon } from "../../map/core/types";

const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392;
const MAX_SCALE_WIDTH_PX = 80;

function niceDistance(meters: number): number {
  const exponent = Math.floor(Math.log10(meters));
  const fraction = meters / 10 ** exponent;
  const step = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return step * 10 ** exponent;
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${meters / 1000} km` : `${Math.round(meters)} m`;
}

export function MapScale({ center, zoom }: { center: LatLon; zoom: number }) {
  const latitudeFactor = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  const metersPerPixel = (METERS_PER_PIXEL_AT_ZOOM_0 * latitudeFactor) / Math.pow(2, zoom);
  const distance = niceDistance(metersPerPixel * MAX_SCALE_WIDTH_PX);
  const width = distance / metersPerPixel;

  return (
    <div className="map-scale" aria-label={`Escala del mapa: ${formatDistance(distance)}`}>
      <span className="map-scale-label">{formatDistance(distance)}</span>
      <span className="map-scale-bar" style={{ width: `${width}px` }} />
    </div>
  );
}
