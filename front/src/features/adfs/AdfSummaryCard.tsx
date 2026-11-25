import type { Adf } from "@/contexts/AdfContext";
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
    <div className="border border-border rounded mt-2">
      <div className="flex items-start justify-between gap-2 px-3 py-2 bg-soft border-b border-border">
        <div>
          <div className="text-[0.9rem] font-semibold text-ink">{adf.nom}</div>
          <div className="text-[0.75rem] text-muted">Número {adf.id}</div>
        </div>
        {isAdmin && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={onRecalculate}
              disabled={recalculating}
              className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem] disabled:opacity-50"
              title="Recalcular els límits territorials des d'OSM"
            >
              {recalculating ? "⏳" : "🔄"}
            </button>
            <button
              onClick={onEdit}
              className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
              title="Modificar l'ADF"
            >
              ✏️
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="bg-transparent border border-red-300 text-red-700 rounded px-2 py-1 cursor-pointer text-[0.8rem] disabled:opacity-50"
              title="Eliminar l'ADF"
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      <dl className="m-0 px-3 py-2 text-[0.8rem] space-y-1">
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
            <dt className="text-muted shrink-0">Tracking compartit:</dt>
            <dd className="m-0">{adf.tracking_shared ? "Sí" : "No"}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
