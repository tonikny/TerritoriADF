import type { Adf } from "@/contexts/AdfContext";
import { iconButtonClass, secondaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";
import { KM2_FORMAT, osmRelationUrl } from "./adfDraft";

/**
 * Resum de l'ADF activa: relacions OSM (només qui les pot veure), superfície i
 * tracking compartit, amb les accions d'administrador.
 */
export function AdfSummaryCard({
  adf,
  areaKm2,
  isAdmin,
  canSeeOsmRelations,
  canSeeTrackingSharing,
  recalculating,
  deleting,
  onRecalculate,
  onEdit,
  onDelete,
}: {
  adf: Adf;
  areaKm2: number | null;
  isAdmin: boolean;
  canSeeOsmRelations: boolean;
  canSeeTrackingSharing: boolean;
  recalculating: boolean;
  deleting: boolean;
  onRecalculate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border-strong bg-white shadow-control mt-2">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-soft border-b border-soft">
        <div className="min-w-0">
          <div className="text-base font-semibold text-ink leading-tight">{adf.nom}</div>
          <div className="text-sm text-muted">Número {adf.id}</div>
        </div>
        {isAdmin && (
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={onEdit}
              aria-label="Modificar l'ADF"
              title="Modificar l'ADF"
              className={iconButtonClass}
            >
              <ActionGlyph name="edit" />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              aria-label="Eliminar l'ADF"
              title="Eliminar l'ADF"
              className={`${iconButtonClass} border-alert/40 text-alert`}
            >
              <ActionGlyph name="trash" />
            </button>
          </div>
        )}
      </div>

      <dl className="m-0 px-3 py-2 text-sm space-y-1">
        {canSeeOsmRelations && (
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Relacions OSM:</dt>
            <dd className="m-0 flex flex-wrap gap-x-2 gap-y-0.5">
              {adf.osm_relations.length === 0
                ? "Cap"
                : adf.osm_relations.map((relation) => {
                    const url = osmRelationUrl(relation);
                    return url ? (
                      <a
                        key={relation}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                      >
                        {relation}
                      </a>
                    ) : (
                      <span key={relation}>{relation}</span>
                    );
                  })}
            </dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="text-muted shrink-0">Superfície:</dt>
          <dd className="m-0">
            {areaKm2 !== null ? `${KM2_FORMAT.format(areaKm2)} km²` : "Pendent de calcular"}
          </dd>
        </div>
        {canSeeTrackingSharing && (
          <div className="flex gap-2">
            <dt className="text-muted shrink-0">Seguiment compartit:</dt>
            <dd className="m-0">{adf.tracking_shared ? "Sí" : "No"}</dd>
          </div>
        )}
      </dl>

      {isAdmin && (
        <div className="px-3 pb-3">
          <button
            onClick={onRecalculate}
            disabled={recalculating}
            className={`${secondaryButtonClass} w-full`}
            title="Recalcular els límits territorials des d'OSM"
          >
            <ActionGlyph name="refresh" />
            {recalculating ? "Recalculant límits..." : "Recalcular límits"}
          </button>
        </div>
      )}
    </div>
  );
}
