import { toast } from "react-toastify";
import type { OsmSyncStats } from "@territoriadf/contracts/osm";

import { useAdf } from "@/contexts/AdfContext";
import { apiErrorMessage } from "@/shared/api/client";
import { useOsmMutations } from "./mutations";
import type { SectionKey } from "./osmSections";

/**
 * Accions del panell d'OSM. Els missatges de resultat (pujats, conflictes,
 * errors, per revisar) es dedueixen de la resposta del servidor, no de
 * l'estat local: el push d'OSM és el que decideix.
 */
export function useOsmActions() {
  const { activeAdf } = useAdf();
  const actions = useOsmMutations();

  const pushSelected = async (ids: string[], onDone?: () => void) => {
    if (ids.length === 0) {
      return;
    }
    try {
      const data = await actions.push.mutateAsync(ids);
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
      onDone?.();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const discardSelected = async (ids: string[], onDone?: () => void) => {
    if (ids.length === 0) {
      return;
    }
    if (!window.confirm(`Descartar ${ids.length} canvis seleccionats?`)) {
      return;
    }
    try {
      const data = await actions.discard.mutateAsync(ids);
      const parts: string[] = [];
      if (data.discarded > 0) {
        parts.push(`${data.discarded} descartats`);
      }
      if (data.deleted > 0) {
        parts.push(`${data.deleted} esborrats`);
      }
      toast.success(parts.join(", ") || "Fet");
      onDone?.();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const pullSync = async (stats: OsmSyncStats | null) => {
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
    try {
      const data = await actions.pullSync.mutateAsync();
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message || "Error desconegut");
      }
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const pushOne = async (id: string) => {
    try {
      const data = await actions.push.mutateAsync([id]);
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
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const discardOne = async (id: string, section: SectionKey, label: string) => {
    const msg =
      section === "PENDING_CREATE"
        ? `Esborrar "${label}" de la base de dades?`
        : `Revertir "${label}" al valor d'OSM? Es perdràn els canvis locals.`;
    if (!window.confirm(msg)) {
      return;
    }
    try {
      await actions.discard.mutateAsync([id]);
      toast.success("Descartat");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  /** Purga manual dels hidrants que ja no són a OSM (no s'esborren durant el pull). */
  const purgeMissing = async (ids?: string[], onDone?: () => void) => {
    const msg =
      ids && ids.length > 0
        ? `Esborrar definitivament ${ids.length} hidrant(s) de la base de dades?\nLes seves dades locals (observacions incloses) es perdran.`
        : `Esborrar definitivament tots els hidrants d'aquesta ADF que ja no són a OSM?\nLes seves dades locals (observacions incloses) es perdran.`;
    if (!window.confirm(msg)) {
      return;
    }
    try {
      const data = await actions.purge.mutateAsync(ids);
      toast.success(`${data.deleted} hidrants esborrats`);
      onDone?.();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const pullFromOsm = async (id: string, label: string) => {
    if (
      !window.confirm(`Aplicar versió d'OSM a "${label}"?\nLes dades locals es sobreescriuran.`)
    ) {
      return;
    }
    try {
      await actions.pull.mutateAsync(id);
      toast.success("Dades d'OSM aplicades");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return {
    actions,
    pushSelected,
    discardSelected,
    pullSync,
    pushOne,
    discardOne,
    purgeMissing,
    pullFromOsm,
  };
}
