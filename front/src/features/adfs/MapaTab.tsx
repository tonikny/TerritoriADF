import type { ReactNode } from "react";
import { adfLabel } from "@/utils/adfLabel";
import { iconButtonClass, primaryButtonClass, selectClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";
import { AdfDraftForm } from "./AdfDraftForm";
import { AdfSummaryCard } from "./AdfSummaryCard";
import { OfflineMapSection } from "./OfflineMapSection";
import { useAdfDraft } from "./useAdfDraft";

/**
 * Pestanya ADF: selecció, resum, alta/edició i, si el rol ho permet, el panell
 * d'OSM. L'estat viu a `useAdfDraft`; aquí només es compon la vista.
 */
export function MapaTab({ osmSyncPanel }: { osmSyncPanel?: ReactNode }) {
  const a = useAdfDraft();
  const activeAdf = a.activeAdf;

  if (a.isLoading) {
    return <div className="text-center p-8 text-muted text-sm">Carregant ADFs...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="panel-title">ADF</h3>
        {a.isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={a.startCreate}
              className={`${primaryButtonClass}`}
              title="Crear una ADF"
            >
              + Nova
            </button>
            <button
              onClick={() => {
                void a.reloadList();
              }}
              className={iconButtonClass}
              aria-label="Recarregar la llista"
              title="Recarregar la llista"
            >
              <ActionGlyph name="refresh" />
            </button>
          </div>
        )}
      </div>

      {a.draft && (
        <AdfDraftForm
          mode={a.draftMode}
          draft={a.draft}
          submitting={a.submitting}
          onChange={a.updateDraft}
          onSubmit={a.submitDraft}
          onCancel={a.cancelDraft}
        />
      )}

      <label className="block text-sm text-muted">
        <span className="sr-only">Escull l'ADF</span>
        <select
          value={activeAdf?.id ?? ""}
          onChange={(e) => a.selectAdf(Number(e.target.value))}
          className={selectClass}
        >
          <option value="" disabled>
            — Escull una ADF —
          </option>
          {a.adfs.map((adf) => (
            <option key={adf.id} value={adf.id}>
              {adfLabel(adf.id, adf.nom)}
            </option>
          ))}
        </select>
      </label>

      {!activeAdf && (
        <p className="text-muted text-sm mt-2">
          {a.adfs.length === 0
            ? "Encara no hi ha cap ADF."
            : "Selecciona una ADF per veure'n les dades."}
        </p>
      )}

      {activeAdf && (
        <AdfSummaryCard
          adf={activeAdf}
          areaKm2={a.areaKm2}
          isAdmin={a.isAdmin}
          canSeeOsmRelations={a.canSeeOsmRelations}
          canSeeTrackingSharing={a.canSeeTrackingSharing}
          recalculating={a.recalculating}
          deleting={a.deleting}
          onRecalculate={() => {
            void a.recalculateBoundaries(activeAdf.id);
          }}
          onEdit={() => a.startEdit(activeAdf)}
          onDelete={() => {
            void a.removeAdf();
          }}
        />
      )}

      {activeAdf && (
        <OfflineMapSection key={activeAdf.id} adfId={activeAdf.id} bbox={activeAdf.bbox} />
      )}

      {a.canSyncOsm && (
        <>
          <div className="flex items-center gap-3 mt-6 mb-3" role="separator" aria-label="OSM">
            <span className="flex-1 h-px bg-border" />
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              OSM
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <h4 className="panel-title mb-2">Sincronització amb OSM</h4>
          {osmSyncPanel}
        </>
      )}
    </div>
  );
}
