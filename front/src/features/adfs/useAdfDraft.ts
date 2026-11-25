import { can } from "@territoriadf/contracts/permissions";
import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { adfLabel } from "@/utils/adfLabel";
import { logError } from "@/utils/log";
import {
  boundaryAreaKm2,
  draftFrom,
  EMPTY_ADF_DRAFT,
  parseRelations,
  type AdfDraft,
  type DraftMode,
} from "./adfDraft";
import { useAdfMutations } from "./mutations";

/**
 * Alta, edició, recàlcul de límits i esborrat de l'ADF activa. Les portes de
 * rol (admin, relacions OSM, tracking compartit) també es resolen aquí perquè
 * la vista només decideixi què pinta.
 */
export function useAdfDraft() {
  const { adfs, isLoading, activeAdf, setActiveAdf, refreshAdfs, boundaryGeojson } = useAdf();
  const { user } = useAuth();
  const mutations = useAdfMutations();

  const isAdmin = user?.role === "admin";
  const permissions = user?.permissions ?? [];
  // Les relacions OSM només les veu l'admin; el tracking compartit, coordinadors i admins.
  const canSeeOsmRelations = can(permissions, "view_osm_link");
  const canSeeTrackingSharing = can(permissions, "view_shared_positions");
  const canSyncOsm = can(permissions, "sync_osm");
  const areaKm2 = boundaryAreaKm2(boundaryGeojson);

  const [draft, setDraft] = useState<AdfDraft | null>(null);
  const [draftMode, setDraftMode] = useState<DraftMode>("create");
  const submitting = mutations.create.isPending || mutations.update.isPending;
  const deleting = mutations.remove.isPending;
  const recalculating = mutations.recalculate.isPending;

  const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Error");

  function startCreate() {
    setDraft(EMPTY_ADF_DRAFT);
    setDraftMode("create");
  }

  function startEdit(adf: Parameters<typeof draftFrom>[0]) {
    setDraft(draftFrom(adf));
    setDraftMode("edit");
  }

  function updateDraft(patch: Partial<AdfDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function selectAdf(id: number) {
    setDraft(null);
    setActiveAdf(adfs.find((a) => a.id === id) ?? null);
  }

  async function recalculateBoundaries(adfId: number) {
    try {
      // La mutació invalida la frontera i actualitza bbox/center a la caché.
      const updated = await mutations.recalculate.mutateAsync(adfId);
      if (updated) {
        setActiveAdf(updated);
      }
      toast.success("Límits territorials actualitzats");
    } catch (err) {
      toast.warning(`No s'han pogut calcular els límits: ${errorMessage(err)}`);
    }
  }

  async function submitDraft(e: FormEvent) {
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

    try {
      const adf =
        draftMode === "create"
          ? await mutations.create.mutateAsync({ id: adfId, nom, osm_relations: relations })
          : await mutations.update.mutateAsync({ adfId, input: { nom, osm_relations: relations } });

      setDraft(null);
      toast.success(draftMode === "create" ? `ADF ${adf.id} creada` : "ADF actualitzada");
      if (draftMode === "create" || relationsChanged) {
        // Els límits deriven de les relacions OSM: es recalculen sense sortir de l'app.
        await recalculateBoundaries(adf.id);
      } else {
        setActiveAdf(adf);
      }
    } catch (err) {
      toast.error(errorMessage(err));
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
    try {
      const remaining = adfs.filter((a) => a.id !== activeAdf.id);
      await mutations.remove.mutateAsync(activeAdf.id);
      setActiveAdf(remaining[0] ?? null);
      setDraft(null);
      toast.success("ADF eliminada");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function reloadList() {
    try {
      await refreshAdfs();
    } catch (err) {
      logError("Error actualitzant la llista d'ADFs", err);
    }
  }

  return {
    adfs,
    isLoading,
    activeAdf,
    draft,
    draftMode,
    submitting,
    deleting,
    recalculating,
    areaKm2,
    isAdmin,
    canSeeOsmRelations,
    canSeeTrackingSharing,
    canSyncOsm,
    startCreate,
    startEdit,
    updateDraft,
    cancelDraft: () => setDraft(null),
    selectAdf,
    submitDraft,
    recalculateBoundaries,
    removeAdf,
    reloadList,
  };
}

export type AdfDraftState = ReturnType<typeof useAdfDraft>;
