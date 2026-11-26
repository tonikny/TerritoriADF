import { useState } from "react";
import { toast } from "react-toastify";
import { secondaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";
import { logError } from "@/utils/log";

/** Botó compacte que exporta a PDF el contingut filtrat d'una llista. */
export function PdfExportButton({
  onExport,
  errorLabel,
}: {
  onExport: () => Promise<void>;
  errorLabel: string;
}) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    setExporting(true);
    try {
      await onExport();
    } catch (err) {
      logError(errorLabel, err);
      toast.error("No s'ha pogut generar el PDF");
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      onClick={() => {
        void handleClick();
      }}
      disabled={exporting}
      aria-label="Exporta la llista filtrada a PDF"
      title="Exporta la llista filtrada a PDF"
      className={`${secondaryButtonClass} shrink-0 disabled:opacity-60`}
    >
      <ActionGlyph name="report" />
      {exporting ? "…" : "PDF"}
    </button>
  );
}
