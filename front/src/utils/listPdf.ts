import type { AdfData } from "../contexts/AdfContext";
import type { HidrantFeature } from "../hooks/useHidrantData";
import type { IncidenciaFeature } from "../types";
import type { PdfCell, PdfColumn } from "./pdfExport";
import { adfLabel } from "./adfLabel";
import { getIncidenciaShareUrl, getNodeShareUrl } from "./urlParams";
import { ESTATS_INCIDENCIA, PRIORITATS_INCIDENCIA, labelDeCategoria } from "./incidenciaConstants";
import { exportTablesToPdf } from "./pdfExport";

const HIDRANT_COLUMNS: PdfColumn[] = [
  { header: "Adreça", weight: 2.8 },
  { header: "Barri", weight: 1.5 },
  { header: "Estat", weight: 1.5 },
  { header: "Revisió", weight: 1.2 },
  { header: "Diàmetres", weight: 1.4, align: "right" },
  // Icona d'enllaç al node dins l'app (la URL no es mostra).
  { header: "Enllaç", weight: 0.7, align: "center" },
];

const INCIDENCIA_COLUMNS: PdfColumn[] = [
  { header: "Títol", weight: 3.6 },
  { header: "Estat", weight: 1.4 },
  { header: "Prioritat", weight: 1.4 },
  { header: "Actualitzada", weight: 2, align: "right" },
  // Icona d'enllaç a la incidència dins l'app (la URL no es mostra).
  { header: "Enllaç", weight: 0.7, align: "center" },
];

function reportMeta(adf: AdfData | null, filterDescription: string) {
  const now = new Date();
  return {
    subtitle: [
      adf ? adfLabel(adf.id, adf.nom) : "Totes les ADFs",
      now.toLocaleString("ca-ES"),
      filterDescription ? `Filtres — ${filterDescription}` : "Sense filtres",
    ].join(" · "),
    adfId: adf ? adf.id : "general",
    date: now.toISOString().slice(0, 10),
  };
}

/** Exporta a PDF la llista d'hidrants tal com es mostra (filtrada, si ho està). */
export async function exportHydrantListPdf({
  adf,
  hydrants,
  total,
  filterDescription,
}: {
  adf: AdfData | null;
  hydrants: HidrantFeature[];
  total: number;
  filterDescription: string;
}) {
  const meta = reportMeta(adf, filterDescription);
  await exportTablesToPdf({
    title: "Hidrants",
    subtitle: meta.subtitle,
    fileName: `hidrants-${meta.adfId}-${meta.date}.pdf`,
    tables: [
      {
        title: `Hidrants (${hydrants.length} de ${total})`,
        columns: HIDRANT_COLUMNS,
        rows: hydrants.map((feature) => {
          const ui = feature.properties.ui_fields;
          const row: PdfCell[] = [
            `${ui.street || ""} ${ui.num || ""}`.trim() || "Sense adreça",
            ui.barri || "",
            ui.estat || "Desconegut",
            ui.surveyDate || "No revisat",
            ui.diameters ? `${ui.diameters.split(";").join(", ")} mm` : "",
            // Mateix enllaç que en triar la fila a la llista: /?adf=N&node=ID
            { kind: "link", url: getNodeShareUrl(feature.id) },
          ];
          return row;
        }),
      },
    ],
  });
}

/** Exporta a PDF la llista d'incidències tal com es mostra (filtrada, si ho està). */
export async function exportIncidenciaListPdf({
  adf,
  incidencies,
  total,
  filterDescription,
}: {
  adf: AdfData | null;
  incidencies: IncidenciaFeature[];
  total: number;
  filterDescription: string;
}) {
  const meta = reportMeta(adf, filterDescription);
  await exportTablesToPdf({
    title: "Incidències",
    subtitle: meta.subtitle,
    fileName: `incidencies-${meta.adfId}-${meta.date}.pdf`,
    tables: [
      {
        title: `Incidències (${incidencies.length} de ${total})`,
        columns: INCIDENCIA_COLUMNS,
        rows: incidencies.map((feature) => [
          feature.properties.titol,
          labelDeCategoria(ESTATS_INCIDENCIA, feature.properties.estat),
          labelDeCategoria(PRIORITATS_INCIDENCIA, feature.properties.prioritat),
          new Date(feature.properties.actualitzat_at).toLocaleString("ca-ES"),
          // Mateix enllaç que en triar la fila a la llista: /?adf=N&incidencia=ID
          { kind: "link", url: getIncidenciaShareUrl(feature.id) },
        ]),
      },
    ],
  });
}
