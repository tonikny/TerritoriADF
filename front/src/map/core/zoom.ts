/**
 * MapLibre té el món a 512·2^z px i Leaflet a 256·2^z: el zoom del motor
 * queda un nivell per sota del zoom neutral (convenció Leaflet).
 */
export const toEngineZoom = (leafletZoom: number): number => leafletZoom - 1;

export const toNeutralZoom = (maplibreZoom: number): number => maplibreZoom + 1;
