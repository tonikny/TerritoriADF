import type { jsPDF } from "jspdf";

export interface PdfLinkCell {
  kind: "link";
  url: string;
}

export type PdfCell = string | PdfLinkCell;

export interface PdfColumn {
  header: string;
  /** Pes relatiu de l'amplada de la columna. */
  weight: number;
  align?: "left" | "right" | "center";
}

export interface PdfTable {
  title: string;
  columns: PdfColumn[];
  rows: PdfCell[][];
}

export interface PdfOptions {
  title: string;
  subtitle?: string;
  fileName: string;
  tables: PdfTable[];
}

const MARGIN = 14;
const LINE_HEIGHT = 4.2;
const ROW_PADDING = 1.3;
const FONT = "helvetica";
const LINK_ICON_SIZE = 3.4;

function isLinkCell(cell: PdfCell | undefined): cell is PdfLinkCell {
  return typeof cell === "object" && cell !== null;
}

/** Icona «obre en una finestra externa»: un quadre amb una fletxa que en surt. */
function drawExternalLinkIcon(doc: jsPDF, x: number, y: number, size: number) {
  doc.setDrawColor(38, 84, 124);
  doc.setLineWidth(0.28);
  // Marc de la finestra, amb la cantonada superior dreta oberta per on surt la fletxa.
  doc.rect(x, y + size * 0.3, size * 0.62, size * 0.62, "S");
  // Fletxa diagonal.
  doc.line(x + size * 0.28, y + size * 0.72, x + size, y);
  // Punta de la fletxa.
  doc.line(x + size * 0.62, y, x + size, y);
  doc.line(x + size, y, x + size, y + size * 0.38);
  doc.setDrawColor(20);
  doc.setLineWidth(0.2);
}

/** Genera i descarrega un PDF A4 amb una o més taules, paginant-les si cal. */
export async function exportTablesToPdf({ title, subtitle, fileName, tables }: PdfOptions) {
  // jspdf és pesat: només es carrega quan l'usuari exporta.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const bottomLimit = pageHeight - 14;
  let y = MARGIN;
  let pageNumber = 1;

  doc.setProperties({ title });
  doc.setTextColor(20);

  function drawFooter() {
    doc.setFont(FONT, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(title, MARGIN, pageHeight - 8);
    doc.text(`Pàgina ${pageNumber}`, pageWidth - MARGIN, pageHeight - 8, { align: "right" });
    doc.setTextColor(20);
  }

  function addPage() {
    drawFooter();
    doc.addPage();
    pageNumber += 1;
    y = MARGIN;
  }

  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  doc.text(title, MARGIN, y + 6);
  y += 10;

  if (subtitle) {
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    const subtitleLines = doc.splitTextToSize(subtitle, contentWidth) as string[];
    doc.text(subtitleLines, MARGIN, y + 4);
    y += subtitleLines.length * LINE_HEIGHT + 4;
    doc.setTextColor(20);
  }

  for (const table of tables) {
    const totalWeight = table.columns.reduce((sum, column) => sum + column.weight, 0) || 1;
    const widths = table.columns.map((column) => (column.weight / totalWeight) * contentWidth);
    const offsets: number[] = [];
    let offset = MARGIN;
    for (const width of widths) {
      offsets.push(offset);
      offset += width;
    }

    const drawHeadRow = () => {
      doc.setFillColor(38, 84, 124);
      doc.rect(MARGIN, y, contentWidth, 7, "F");
      doc.setFont(FONT, "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255);
      table.columns.forEach((column, index) => {
        if (column.align === "center") {
          doc.text(column.header, offsets[index] + widths[index] / 2, y + 4.7, {
            align: "center",
          });
          return;
        }
        const x =
          column.align === "right" ? offsets[index] + widths[index] - 2 : offsets[index] + 2;
        doc.text(
          column.header,
          x,
          y + 4.7,
          column.align === "right" ? { align: "right" } : undefined,
        );
      });
      y += 7;
      doc.setTextColor(20);
    };

    if (y + 20 > bottomLimit) {
      addPage();
    }

    doc.setFont(FONT, "bold");
    doc.setFontSize(11.5);
    doc.text(table.title, MARGIN, y + 4);
    y += 8;

    drawHeadRow();

    if (table.rows.length === 0) {
      doc.setFont(FONT, "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      doc.text("Sense resultats amb els filtres actuals.", MARGIN + 2, y + 4.7);
      y += 8;
      doc.setTextColor(20);
    }

    table.rows.forEach((row, rowIndex) => {
      doc.setFont(FONT, "normal");
      doc.setFontSize(8.5);

      const wrapped = table.columns.map((column, index) => {
        const cell = row[index];
        if (isLinkCell(cell)) {
          return [""];
        }
        return doc.splitTextToSize(String(cell ?? "").trim() || "—", widths[index] - 4) as string[];
      });
      const linesHeight = Math.max(1, ...wrapped.map((lines) => lines.length)) * LINE_HEIGHT;
      const hasLink = row.some(isLinkCell);
      const rowHeight = Math.max(linesHeight, hasLink ? LINK_ICON_SIZE : 0) + ROW_PADDING * 2;

      if (y + rowHeight > bottomLimit) {
        addPage();
        drawHeadRow();
      }

      if (rowIndex % 2 === 1) {
        doc.setFillColor(244, 246, 248);
        doc.rect(MARGIN, y, contentWidth, rowHeight, "F");
      }

      wrapped.forEach((lines, index) => {
        const cell = row[index];
        if (isLinkCell(cell)) {
          const iconX = offsets[index] + (widths[index] - LINK_ICON_SIZE) / 2;
          const iconY = y + (rowHeight - LINK_ICON_SIZE) / 2;
          drawExternalLinkIcon(doc, iconX, iconY, LINK_ICON_SIZE);
          // Zona clicable una mica més gran que la icona.
          doc.link(iconX - 1.5, y + 0.5, LINK_ICON_SIZE + 3, rowHeight - 1, { url: cell.url });
          return;
        }

        const x =
          table.columns[index].align === "right"
            ? offsets[index] + widths[index] - 2
            : offsets[index] + 2;
        lines.forEach((line, lineIndex) => {
          doc.text(
            line,
            x,
            y + ROW_PADDING + LINE_HEIGHT * (lineIndex + 0.8),
            table.columns[index].align === "right" ? { align: "right" } : undefined,
          );
        });
      });

      y += rowHeight;
      doc.setDrawColor(226, 230, 234);
      doc.setLineWidth(0.15);
      doc.line(MARGIN, y, MARGIN + contentWidth, y);
    });

    y += 8;
  }

  drawFooter();
  doc.save(fileName);
}
