import type { ReactNode } from "react";
import { adfLabel } from "@/utils/adfLabel";
import { primaryButtonClass, secondaryButtonClass, selectClass } from "@/styles/uiStyles";
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
    return <div className="text-center p-8 text-muted text-[0.85rem]">Carregant ADFs...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="m-0 text-[0.95rem] font-semibold">ADF</h3>
        {a.isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={a.startCreate}
              className={`${primaryButtonClass} px-2 py-1 text-xs`}
              title="Crear una ADF"
            >
              + Nova
            </button>
            <button
              onClick={() => {
                void a.reloadList();
              }}
              className={`${secondaryButtonClass} px-2 py-1 text-xs`}
              title="Recarregar la llista"
            >
              ↻
            </button>
          </div>
        )}
      </div>

      <label className="block text-[0.8rem] italic">
        <span className="sr-only">Escull l'ADF</span>
        <select
          value={activeAdf?.id ?? ""}
          onChange={(e) => a.selectAdf(Number(e.target.value))}
          className={`${selectClass} px-2 py-2`}
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
        <p className="text-muted text-[0.85rem] mt-2">
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

      {a.canSyncOsm && (
        <>
          <div className="flex items-center gap-3 mt-6 mb-3" role="separator" aria-label="OSM">
            <span className="flex-1 h-px bg-border" />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
              OSM
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <h4 className="m-0 mb-2 text-[0.9rem] font-semibold">Sincronització amb OSM</h4>
          {osmSyncPanel}
        </>
      )}
    </div>
  );
}
