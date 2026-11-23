import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import type { SyncStatus } from "@territoriadf/contracts/sync";
import { useAdf } from "../../contexts/AdfContext";
import { useAuth } from "../../contexts/AuthContext";
import { apiErrorMessage } from "../../shared/api/client";
import {
  discardOsmChanges,
  getOsmPending,
  pullHydrantFromOsm,
  purgeMissingFromOsm,
  pushToOsm,
  syncAdfFromOsm,
  type PendingHidrant,
} from "../../shared/api/osm";
import { queryKeys, viewerKey } from "../../shared/query/keys";

type SectionKey = Exclude<SyncStatus, "SYNCED">;

const SECTION_CONFIG: Record<SectionKey, { label: string; color: string; hint: string }> = {
  PENDING_CREATE: {
    label: "Nous locals",
    color: "text-blue-600",
    hint: "Hidrants creats localment, encara no pujats a OSM.",
  },
  PENDING_UPDATE: {
    label: "Edicions pendents",
    color: "text-blue-600",
    hint: "Hidrants modificats localment, pendent de pujar a OSM.",
  },
  PENDING_DELETE: {
    label: "Esborraments pendents",
    color: "text-red-600",
    hint: "Hidrants marcats per esborrar, pendent d'eliminar a OSM.",
  },
  CONFLICT: {
    label: "Conflictes",
    color: "text-orange-600",
    hint: "OSM té dades diferents. Tria si vols mantenir la versió local o la d'OSM.",
  },
  ERROR: {
    label: "Errors",
    color: "text-red-600",
    hint: "Error durant l'última sincronització. Pots reintentar o descartar.",
  },
  REVIEW: {
    label: "Per revisar",
    color: "text-yellow-600",
    hint: "Dades amb warnings de validació. Revisa-les abans de pujar.",
  },
  MISSING_IN_OSM: {
    label: "Ja no són a OSM",
    color: "text-muted",
    hint: "L'últim pull no els ha trobat a OSM. Es conserven amb les seves dades locals fins que els esborris.",
  },
};

function hidrantLabel(h: PendingHidrant) {
  if (h.street) {
    return `${h.street}${h.num ? `, ${h.num}` : ""}`;
  }
  return h.osm_id ? `OSM ${h.osm_id}` : h.id.slice(0, 8);
}

function parseSyncError(syncError: string | null): string[] {
  if (!syncError) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(syncError);
    if (Array.isArray(parsed)) {
      return parsed.map((e: { message?: string }) => e.message || JSON.stringify(e));
    }
    return [syncError];
  } catch {
    return [syncError];
  }
}

export function OsmSyncPanel({
  onSelectHidrant,
  onRefresh,
}: {
  onSelectHidrant?: (id: string) => void;
  onRefresh?: () => void;
}) {
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [pulling, setPulling] = useState(false);

  const selectHidrant = (id: string) => {
    onSelectHidrant?.(id);
  };

  const refreshHidrants = () => {
    onRefresh?.();
  };

  const pendingQuery = useQuery({
    queryKey: queryKeys.osmPending(adfId, viewer),
    queryFn: ({ signal }) =>
      adfId === null ? Promise.resolve({ pending: [], stats: null }) : getOsmPending(adfId, signal),
    enabled: adfId !== null,
  });

  const pending = pendingQuery.data?.pending ?? [];
  const stats = pendingQuery.data?.stats ?? null;
  const loading = pendingQuery.isFetching || pulling;
  const loadError = pendingQuery.error
    ? apiErrorMessage(pendingQuery.error, "Error carregant canvis pendents")
    : null;

  // Una selecció feta en una altra ADF no ha de comptar en aquesta.
  const selectedIds = useMemo(
    () => (pendingQuery.data?.pending ?? []).filter((h) => selected.has(h.id)).map((h) => h.id),
    [pendingQuery.data, selected],
  );

  const reload = async () => {
    if (adfId === null) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.osmPending(adfId, viewer) });
  };

  const grouped = pending.reduce<Record<SectionKey, PendingHidrant[]>>(
    (acc, h) => {
      const key = h.sync_status;
      if (key in acc) {
        acc[key].push(h);
      }
      return acc;
    },
    {
      PENDING_CREATE: [],
      PENDING_UPDATE: [],
      PENDING_DELETE: [],
      CONFLICT: [],
      ERROR: [],
      REVIEW: [],
      MISSING_IN_OSM: [],
    },
  );

  // Les seccions amb items surten obertes per defecte.
  const isSectionOpen = (key: SectionKey) => openSections[key] ?? true;

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectSection = (ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // --- Accions per lots ---

  const handlePushSelected = async () => {
    if (selectedIds.length === 0) {
      return;
    }
    setActionLoading(true);
    try {
      const data = await pushToOsm(selectedIds);
      if (data.synced > 0) {
        toast.success(`${data.synced} hidrants pujats`);
      }
      if (data.conflicts > 0) {
        toast.warning(`${data.conflicts} conflictes`);
      }
      if (data.errors > 0) {
        toast.error(`${data.errors} errors`);
      }
      if (data.reviewed > 0) {
        toast.info(`${data.reviewed} per revisar`);
      }
      setSelected(new Set());
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardSelected = async () => {
    if (selectedIds.length === 0) {
      return;
    }
    if (!window.confirm(`Descartar ${selectedIds.length} canvis seleccionats?`)) {
      return;
    }
    setActionLoading(true);
    try {
      const data = await discardOsmChanges(selectedIds);
      const parts: string[] = [];
      if (data.discarded > 0) {
        parts.push(`${data.discarded} descartats`);
      }
      if (data.deleted > 0) {
        parts.push(`${data.deleted} esborrats`);
      }
      toast.success(parts.join(", ") || "Fet");
      setSelected(new Set());
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  // --- Pull sync ---

  const handlePullSync = async () => {
    if (!activeAdf) {
      return;
    }
    if (stats && (stats.total_pending > 0 || stats.CONFLICT > 0)) {
      const parts: string[] = [];
      if (stats.PENDING_CREATE > 0) {
        parts.push(`${stats.PENDING_CREATE} nous locals (es mantindran)`);
      }
      if (stats.PENDING_UPDATE > 0) {
        parts.push(`${stats.PENDING_UPDATE} edicions pendents (es mantindran)`);
      }
      if (stats.PENDING_DELETE > 0) {
        parts.push(`${stats.PENDING_DELETE} esborraments pendents (es mantindran)`);
      }
      if (stats.CONFLICT > 0) {
        parts.push(`${stats.CONFLICT} conflictes (es mantindran)`);
      }
      const msg = `Hi ha canvis locals sense pujar:\n• ${parts.join("\n• ")}\n\nBaixar d'OSM actualitzarà els hidrants sincronitzats.\nEls canvis locals NO es perdran.\n\nContinuar?`;
      if (!window.confirm(msg)) {
        return;
      }
    }
    setPulling(true);
    try {
      const data = await syncAdfFromOsm(activeAdf.id);
      if (data.success) {
        toast.success(data.message);
        refreshHidrants();
        void reload();
      } else {
        toast.error(data.message || "Error desconegut");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPulling(false);
    }
  };

  // --- Accions individuals ---

  const handlePushOne = async (id: string) => {
    setActionLoading(true);
    try {
      const data = await pushToOsm([id]);
      if (data.synced > 0) {
        toast.success("Pujat a OSM");
      }
      if (data.conflicts > 0) {
        toast.warning("Conflicte de versió");
      }
      if (data.errors > 0) {
        toast.error("Error en pujar");
      }
      if (data.reviewed > 0) {
        toast.info("Per revisar abans de pujar");
      }
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardOne = async (id: string, key: SectionKey, label: string) => {
    const msg =
      key === "PENDING_CREATE"
        ? `Esborrar "${label}" de la base de dades?`
        : `Revertir "${label}" al valor d'OSM? Es perdràn els canvis locals.`;
    if (!window.confirm(msg)) {
      return;
    }
    setActionLoading(true);
    try {
      await discardOsmChanges([id]);
      toast.success("Descartat");
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  /** Purga manual dels hidrants que ja no són a OSM (no s'esborren durant el pull). */
  const handlePurgeMissing = async (adfId: number, ids?: string[]) => {
    const msg =
      ids && ids.length > 0
        ? `Esborrar definitivament ${ids.length} hidrant(s) de la base de dades?\nLes seves dades locals (observacions incloses) es perdran.`
        : `Esborrar definitivament tots els hidrants d'aquesta ADF que ja no són a OSM?\nLes seves dades locals (observacions incloses) es perdran.`;
    if (!window.confirm(msg)) {
      return;
    }
    setActionLoading(true);
    try {
      const data = await purgeMissingFromOsm(adfId, ids);
      toast.success(`${data.deleted} hidrants esborrats`);
      setSelected(new Set());
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePullFromOsm = async (id: string, label: string) => {
    if (
      !window.confirm(`Aplicar versió d'OSM a "${label}"?\nLes dades locals es sobreescriuran.`)
    ) {
      return;
    }
    setActionLoading(true);
    try {
      await pullHydrantFromOsm(id);
      toast.success("Dades d'OSM aplicades");
      refreshHidrants();
      void reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setActionLoading(false);
    }
  };

  if (!activeAdf) {
    return null;
  }

  const hasItems = pending.length > 0;
  const hasSelected = selectedIds.length > 0;

  return (
    <div className="border border-border rounded overflow-hidden">
      {/* Capçalera */}
      <div className="p-3 bg-bg">
        <div className="flex items-center justify-between">
          <h4 className="m-0 text-[0.85rem] font-semibold">Canvis pendents</h4>
          <button
            onClick={() => void handlePullSync()}
            disabled={loading}
            className="text-[0.75rem] px-2 py-1 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
            title="Actualitza els hidrants sincronitzats des d'OSM. Els canvis locals es mantenen."
          >
            {loading ? "Baixant..." : "Baixar d'OSM"}
          </button>
        </div>
        <p className="m-0 mt-1 text-[0.7rem] text-muted">
          Actualitza els hidrants SYNCED des d'OSM. Els canvis locals no es perden.
        </p>
        {loadError && <p className="m-0 mt-1 text-[0.7rem] text-red-600">{loadError}</p>}
      </div>

      {/* Contingut */}
      {loading && !hasItems ? (
        <div className="p-4 text-center text-muted text-[0.8rem]">Carregant...</div>
      ) : !hasItems ? (
        <div className="p-4 text-center text-muted text-[0.8rem]">No hi ha canvis pendents</div>
      ) : (
        <>
          {/* Accions per lots */}
          {hasSelected && (
            <div className="flex gap-2 px-3 py-2 border-t border-border bg-bg">
              <button
                onClick={() => void handlePushSelected()}
                disabled={actionLoading}
                className="flex-1 text-[0.8rem] px-2 py-1.5 bg-blue-600 text-white border border-blue-700 rounded cursor-pointer disabled:opacity-50"
              >
                Pujar ({selectedIds.length})
              </button>
              <button
                onClick={() => void handleDiscardSelected()}
                disabled={actionLoading}
                className="flex-1 text-[0.8rem] px-2 py-1.5 bg-white text-ink border border-border rounded cursor-pointer disabled:opacity-50"
              >
                Descartar ({selectedIds.length})
              </button>
            </div>
          )}

          {/* Seccions */}
          <div className="divide-y divide-border">
            {(Object.keys(grouped) as SectionKey[]).map((key) => {
              const items = grouped[key];
              if (items.length === 0) {
                return null;
              }
              const config = SECTION_CONFIG[key];
              const isOpen = isSectionOpen(key);

              return (
                <div key={key}>
                  {/* Capçalera de secció */}
                  <button
                    onClick={() => toggleSection(key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left bg-white hover:bg-bg cursor-pointer border-0"
                  >
                    <span className={`text-[0.8rem] font-semibold ${config.color}`}>
                      {isOpen ? "▾" : "▸"} {config.label} ({items.length})
                    </span>
                    {isOpen && key !== "MISSING_IN_OSM" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectSection(items.map((h) => h.id));
                        }}
                        className="text-[0.7rem] text-muted hover:text-ink cursor-pointer"
                      >
                        {items.every((h) => selected.has(h.id))
                          ? "Desseleccionar tot"
                          : "Sel·leccionar tot"}
                      </span>
                    )}
                  </button>

                  {/* Hint de secció */}
                  {isOpen && (
                    <div className="px-3 py-1 text-[0.7rem] text-muted bg-bg/50 border-t border-border">
                      {config.hint}
                      {key === "MISSING_IN_OSM" && activeAdf && (
                        <button
                          onClick={() => void handlePurgeMissing(activeAdf.id)}
                          disabled={actionLoading}
                          className="ml-2 text-[0.7rem] px-1.5 py-0.5 bg-white text-red-600 border border-border rounded cursor-pointer disabled:opacity-50"
                        >
                          Esborrar-los tots
                        </button>
                      )}
                    </div>
                  )}

                  {/* Llista d'items */}
                  {isOpen && (
                    <div className="bg-bg">
                      {items.map((h) => {
                        const errors = parseSyncError(h.sync_error);
                        return (
                          <div
                            key={h.id}
                            className="flex items-start gap-2 px-3 py-2 border-t border-border"
                          >
                            {key !== "MISSING_IN_OSM" && (
                              <input
                                type="checkbox"
                                checked={selected.has(h.id)}
                                onChange={() => toggleSelect(h.id)}
                                className="mt-0.5"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => selectHidrant(h.id)}
                                  className="text-[0.8rem] font-semibold text-ink hover:text-blue-600 cursor-pointer bg-transparent border-0 p-0 truncate"
                                  title="Seleccionar al mapa"
                                >
                                  {hidrantLabel(h)}
                                </button>
                                {h.osm_id && (
                                  <span className="text-[0.7rem] text-muted">OSM {h.osm_id}</span>
                                )}
                              </div>
                              {errors.length > 0 && (
                                <div className="text-[0.7rem] text-muted mt-0.5">
                                  {errors.map((e, i) => (
                                    <div key={i}>• {e}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {/* Pujar: PENDING_CREATE, PENDING_UPDATE, CONFLICT (keep local), ERROR (retry), REVIEW */}
                              {(key === "PENDING_CREATE" ||
                                key === "PENDING_UPDATE" ||
                                key === "ERROR" ||
                                key === "REVIEW") && (
                                <button
                                  onClick={() => void handlePushOne(h.id)}
                                  disabled={actionLoading}
                                  className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
                                  title={
                                    key === "ERROR"
                                      ? "Reintentar pujada"
                                      : key === "REVIEW"
                                        ? "Pujar (ignorar warnings)"
                                        : "Pujar a OSM"
                                  }
                                >
                                  ↑
                                </button>
                              )}
                              {/* Baixar: CONFLICT (keep OSM) */}
                              {key === "CONFLICT" && (
                                <button
                                  onClick={() => void handlePullFromOsm(h.id, hidrantLabel(h))}
                                  disabled={actionLoading}
                                  className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
                                  title="Aplicar versió d'OSM"
                                >
                                  ↓
                                </button>
                              )}
                              {/* Esborrar d'OSM: PENDING_DELETE */}
                              {key === "PENDING_DELETE" && (
                                <button
                                  onClick={() => void handlePushOne(h.id)}
                                  disabled={actionLoading}
                                  className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
                                  title="Confirmar esborrat a OSM"
                                >
                                  ↑
                                </button>
                              )}
                              {/* Ja no és a OSM → purga manual; la resta → descartar */}
                              {key === "MISSING_IN_OSM" ? (
                                <button
                                  onClick={() =>
                                    activeAdf && void handlePurgeMissing(activeAdf.id, [h.id])
                                  }
                                  disabled={actionLoading}
                                  className="text-[0.7rem] px-1.5 py-0.5 bg-white text-red-600 border border-border rounded cursor-pointer disabled:opacity-50"
                                  title="Esborrar definitivament de la base de dades"
                                >
                                  🗑
                                </button>
                              ) : (
                                <button
                                  onClick={() => void handleDiscardOne(h.id, key, hidrantLabel(h))}
                                  disabled={actionLoading}
                                  className="text-[0.7rem] px-1.5 py-0.5 bg-white border border-border rounded cursor-pointer disabled:opacity-50"
                                  title={
                                    key === "PENDING_CREATE"
                                      ? "Esborrar de la BD"
                                      : "Revertir als valors d'OSM? Es perdràn els canvis locals."
                                  }
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
