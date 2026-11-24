import type { MapRasterSpec } from "@/map/core/types";

export type TechnicalLayer = {
  /** L'id és el nom històric desat a localStorage: no canviar-lo. */
  id: string;
  label: string;
  overlay: MapRasterSpec;
};

const todayIso = (): string => new Date().toISOString().split("T")[0];

export function technicalLayers(): TechnicalLayer[] {
  const today = todayIso();

  return [
    {
      id: "Risc d'incendi (FWI)",
      label: "Risc d'incendi (FWI)",
      overlay: {
        id: "effis-fwi",
        opacity: 0.75,
        attribution: "© Copernicus EFFIS / MeteoFrance",
        wms: {
          url: "https://maps.effis.emergency.copernicus.eu/effis",
          layers: "mf010.fwi",
          format: "image/png",
          version: "1.1.1",
          transparent: true,
          time: today,
        },
      },
    },
    {
      id: "Índex Perill (MARK-5 FDI)",
      label: "Índex Perill (MARK-5 FDI)",
      overlay: {
        id: "effis-mark5",
        opacity: 0.75,
        attribution: "© Copernicus EFFIS / ECMWF",
        wms: {
          url: "https://maps.effis.emergency.copernicus.eu/gwis",
          layers: "ecmwf.mark5.fdi",
          format: "image/png",
          version: "1.1.1",
          transparent: true,
          time: today,
        },
      },
    },
    {
      id: "Probabilitat Ignició (NFDRS IC)",
      label: "Probabilitat Ignició (NFDRS IC)",
      overlay: {
        id: "effis-nfdrs",
        opacity: 0.75,
        attribution: "© Copernicus EFFIS / ECMWF",
        wms: {
          url: "https://maps.effis.emergency.copernicus.eu/gwis",
          layers: "ecmwf.nfdrs.ic",
          format: "image/png",
          version: "1.1.1",
          transparent: true,
          time: today,
        },
      },
    },
    {
      id: "Biomassa Arbrat (ICGC)",
      label: "Biomassa Arbrat (ICGC)",
      overlay: {
        id: "icgc-biomass",
        opacity: 0.7,
        attribution: "© ICGC",
        wms: {
          url: "https://geoserveis.icgc.cat/servei/catalunya/variables-biofisiques-arbrat/wms",
          layers: "biomassa_aeria_total_color_2016_2017",
          format: "image/png",
          transparent: true,
        },
      },
    },
  ];
}
