import { apiFetch } from "../../../utils/api";
import { useState } from "react";
import { toast } from "react-toastify";
import turfArea from "@turf/area";
import { useAuth } from "../../../contexts/AuthContext";
import { useAdf, type AdfData } from "../../../contexts/AdfContext";
import { OsmSyncPanel } from "../../osm/OsmSyncPanel";
import { OfflineMapSection } from "../shared/OfflineMapSection";
import { adfLabel } from "../../../utils/adfLabel";
import { logError } from "../../../utils/log";
import {
  inputClass,
  selectClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../../styles/uiStyles";

type Draft = {
  numero: string;
  nom: string;
  relations: string;
};

type DraftMode = "create" | "edit";

const EMPTY_DRAFT: Draft = { numero: "", nom: "", relations: "" };

const draftFrom = (adf: AdfData): Draft => ({
  numero: String(adf.id),
  nom: adf.nom,
  relations: adf.osm_relations.join(", "),
});

/** "R345695, 345699" → ["R345695", "R345699"] */
function parseRelations(value: string): string[] {
  const relations = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((r) => {
      const t = r.trim().toUpperCase();
      return /^\d+$/.test(t) ? `R${t}` : t;
    });
  return [...new Set(relations)];
}

function osmRelationUrl(relation: string): string | null {
  const m = /^([RWN])(\d+)$/.exec(relation);
  if (!m) {
    return null;
  }
  const kind = m[1] === "R" ? "relation" : m[1] === "W" ? "way" : "node";
  return `https://www.openstreetmap.org/${kind}/${m[2]}`;
}

/** Superfície (km²) del límit territorial guardat, o null si encara no s'ha calculat. */
function boundaryAreaKm2(boundaryGeojson: string | null): number | null {
  if (!boundaryGeojson) {
    return null;
  }
  try {
    return turfArea(JSON.parse(boundaryGeojson)) / 1_000_000;
  } catch {
    return null;
  }
}

const KM2_FORMAT = new Intl.NumberFormat("ca-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MapaTab({
  onSelectHydrant,
  onRefresh,
}: {
  onSelectHydrant?: (id: string) => void;
  onRefresh?: () => void;
}) {
  const { adfs, isLoading, activeAdf, setActiveAdf, refreshAdfs, boundaryGeojson } = useAdf();
  const areaKm2 = boundaryAreaKm2(boundaryGeojson);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const permissions = user?.permissions ?? [];
  // Les relacions OSM només les veu l'admin; el tracking compartit, coordinadors i admins.
  const canSeeOsmRelations = permissions.includes("view_osm_link");
  const canSeeTrackingSharing = permissions.includes("view_shared_positions");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftMode, setDraftMode] = useState<DraftMode>("create");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  function startCreate() {
    setDraft(EMPTY_DRAFT);
    setDraftMode("create");
  }

  function startEdit(adf: AdfData) {
    setDraft(draftFrom(adf));
    setDraftMode("edit");
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) {
      return;
    }

    const nom = draft.nom.trim();
    if (!nom) {
      toast.error("El nom de l'ADF és obligatori");
      return;
    }
    const relations = parseRelations(draft.relations);
    if (relations.length === 0) {
      toast.error("Cal almenys una relació OSM (p. ex. R345695)");
      return;
    }
    const adfId = Number(draft.numero);
    if (draftMode === "create" && (!Number.isInteger(adfId) || adfId < 1 || adfId > 999)) {
      toast.error("El número d'ADF ha de ser un enter entre 1 i 999");
      return;
    }
    const relationsChanged =
      draftMode === "edit" &&
      JSON.stringify(activeAdf?.osm_relations ?? []) !== JSON.stringify(relations);

    setSubmitting(true);
    try {
      const url = draftMode === "create" ? "/api/adfs" : `/api/adfs/${adfId}`;
      const body =
        draftMode === "create"
          ? { id: adfId, nom, osm_relations: relations }
          : { nom, osm_relations: relations };
      const res = await apiFetch(url, {
        method: draftMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `API ${res.status}`);
      }

      setDraft(null);
      toast.success(draftMode === "create" ? `ADF ${data.id} creada` : "ADF actualitzada");
      if (draftMode === "create" || relationsChanged) {
        // Els límits deriven de les relacions OSM: es recalculen sense sortir de l'app.
        await recalculateBoundaries(Number(data.id));
      } else {
        const list = await refreshAdfs();
        setActiveAdf(list.find((a) => a.id === data.id) ?? null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function recalculateBoundaries(adfId: number) {
    setRecalculating(true);
    try {
      const res = await apiFetch(`/api/adfs/${adfId}/boundaries`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `API ${res.status}`);
      }
      const list = await refreshAdfs();
      setActiveAdf(list.find((a) => a.id === adfId) ?? null);
      toast.success("Límits territorials actualitzats");
    } catch (err) {
      toast.warning(
        `No s'han pogut calcular els límits: ${err instanceof Error ? err.message : "Error"}`,
      );
    } finally {
      setRecalculating(false);
    }
  }

  async function removeAdf() {
    if (!activeAdf) {
      return;
    }
    if (
      !window.confirm(
        `Eliminar ${adfLabel(activeAdf.id, activeAdf.nom)}?\nAquesta acció no es pot desfer.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/adfs/${activeAdf.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `API ${res.status}`);
      }
      const list = await refreshAdfs();
      setActiveAdf(list[0] ?? null);
      setDraft(null);
      toast.success("ADF eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeleting(false);
    }
  }

  async function reloadList() {
    try {
      await refreshAdfs();
    } catch (err) {
      logError("Error actualitzant la llista d'ADFs", err);
    }
  }

  if (isLoading) {
    return <div className="text-center p-8 text-muted text-[0.85rem]">Carregant ADFs...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="m-0 text-[0.95rem] font-semibold">ADF</h3>
        {isAdmin && (
          <div className="flex gap-1">
            <button
              onClick={startCreate}
              className={`${primaryButtonClass} px-2 py-1 text-xs`}
              title="Crear una ADF"
            >
              + Nova
            </button>
            <button
              onClick={() => {
                void reloadList();
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
          onChange={(e) => {
            setDraft(null);
            setActiveAdf(adfs.find((a) => a.id === Number(e.target.value)) ?? null);
          }}
          className={`${selectClass} px-2 py-2`}
        >
          <option value="" disabled>
            — Escull una ADF —
          </option>
          {adfs.map((adf) => (
            <option key={adf.id} value={adf.id}>
              {adfLabel(adf.id, adf.nom)}
            </option>
          ))}
        </select>
      </label>

      {!activeAdf && (
        <p className="text-muted text-[0.85rem] mt-2">
          {adfs.length === 0
            ? "Encara no hi ha cap ADF."
            : "Selecciona una ADF per veure'n les dades."}
        </p>
      )}

      {activeAdf && (
        <div className="border border-border rounded mt-2">
          <div className="flex items-start justify-between gap-2 px-3 py-2 bg-soft border-b border-border">
            <div>
              <div className="text-[0.9rem] font-semibold text-ink">{activeAdf.nom}</div>
              <div className="text-[0.75rem] text-muted">Número {activeAdf.id}</div>
            </div>
            {isAdmin && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => {
                    void recalculateBoundaries(activeAdf.id);
                  }}
                  disabled={recalculating}
                  className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem] disabled:opacity-50"
                  title="Recalcular els límits territorials des d'OSM"
                >
                  {recalculating ? "⏳" : "🔄"}
                </button>
                <button
                  onClick={() => startEdit(activeAdf)}
                  className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
                  title="Modificar l'ADF"
                >
                  ✏️
                </button>
                <button
                  onClick={() => {
                    void removeAdf();
                  }}
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
                  {activeAdf.osm_relations.length === 0
                    ? "Cap"
                    : activeAdf.osm_relations.map((relation) => {
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
                <dd className="m-0">{activeAdf.tracking_shared ? "Sí" : "No"}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {activeAdf && (
        <OfflineMapSection key={activeAdf.id} adfId={activeAdf.id} bbox={activeAdf.bbox} />
      )}

      {draft && (
        <form
          onSubmit={(e) => {
            void submitDraft(e);
          }}
          className="border border-primary rounded p-3 mt-2 bg-soft"
        >
          <div className="text-[0.8rem] font-semibold mb-2">
            {draftMode === "create"
              ? "Nova ADF"
              : `Modificar ${adfLabel(Number(draft.numero), draft.nom)}`}
          </div>
          <label className="block text-[0.8rem] italic mb-2">
            Número d'ADF:
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={draft.numero}
              disabled={draftMode === "edit"}
              onChange={(e) =>
                setDraft((d) =>
                  d ? { ...d, numero: e.target.value.replace(/\D/g, "").slice(0, 3) } : d,
                )
              }
              placeholder="---"
              className={`${inputClass} bg-white px-2 disabled:bg-soft disabled:text-muted`}
              required
            />
          </label>
          <label className="block text-[0.8rem] italic mb-2">
            Nom:
            <input
              type="text"
              value={draft.nom}
              onChange={(e) => setDraft((d) => (d ? { ...d, nom: e.target.value } : d))}
              placeholder="ADF ..."
              className={`${inputClass} bg-white px-2`}
              required
            />
          </label>
          <label className="block text-[0.8rem] italic mb-1">
            Relacions OSM:
            <input
              type="text"
              value={draft.relations}
              onChange={(e) => setDraft((d) => (d ? { ...d, relations: e.target.value } : d))}
              placeholder="R345695, R345699"
              className={`${inputClass} bg-white px-2`}
              required
            />
          </label>
          <p className="m-0 mb-2 text-[0.7rem] text-muted">
            Separa les relacions per comes. Els límits territorials es calculen automàticament en
            desar.
          </p>
          <div className="flex gap-2 mt-1">
            <button
              type="submit"
              disabled={submitting}
              className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
            >
              {submitting ? "Guardant..." : draftMode === "create" ? "Crear" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
            >
              Cancel·la
            </button>
          </div>
        </form>
      )}

      {permissions.includes("sync_osm") && (
        <>
          <div className="flex items-center gap-3 mt-6 mb-3" role="separator" aria-label="OSM">
            <span className="flex-1 h-px bg-border" />
            <span className="text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted">
              OSM
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <h4 className="m-0 mb-2 text-[0.9rem] font-semibold">Sincronització amb OSM</h4>
          <OsmSyncPanel onSelectHydrant={onSelectHydrant} onRefresh={onRefresh} />
        </>
      )}
    </div>
  );
}
