import type { AdfBbox } from "@territoriadf/contracts/adfs";
import { useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  buildOfflineMapPlan,
  downloadOfflineMap,
  ensureTileCacheReady,
  getOfflineMapInfo,
  saveOfflineMapInfo,
} from "@/map/shared/offlineMap";
import { timeAgo } from "@/utils/time";
import { primaryButtonClass, secondaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";

const MB_FORMAT = new Intl.NumberFormat("ca-ES", { maximumFractionDigits: 1 });

export function OfflineMapSection({ adfId, bbox }: { adfId: number; bbox: AdfBbox | null }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [info, setInfo] = useState(() => getOfflineMapInfo(adfId));
  const abortRef = useRef<AbortController | null>(null);

  const bboxKey = bbox?.join(",") ?? "";
  const plan = useMemo(
    () => buildOfflineMapPlan(bbox),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bboxKey cobreix canvis de límits
    [bboxKey],
  );

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  async function startDownload() {
    if (plan.tiles === 0 || downloading) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloading(true);
    setProgress({ done: 0, total: plan.tiles });
    try {
      await ensureTileCacheReady();
      const { failed } = await downloadOfflineMap(plan.urls, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (controller.signal.aborted) {
        toast.info("Descàrrega del mapa cancel·lada");
        return;
      }
      const saved = plan.tiles - failed;
      saveOfflineMapInfo(adfId, { at: Date.now(), tiles: saved });
      setInfo(getOfflineMapInfo(adfId));
      if (failed > 0) {
        toast.warning(`Mapa desat, però ${failed} tessel·les no s'han pogut baixar`);
      } else {
        toast.success(`Mapa de l'ADF desat (${saved} tessel·les)`);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        toast.info("Descàrrega del mapa cancel·lada");
        return;
      }
      toast.error(err instanceof Error ? err.message : "No s'ha pogut baixar el mapa");
    } finally {
      abortRef.current = null;
      setDownloading(false);
    }
  }

  return (
    <section className="border border-border rounded-lg mt-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="m-0 text-sm font-semibold">Mapa offline</h4>
        {info && !downloading && (
          <span className="text-muted text-sm">Desat {timeAgo(info.at)}</span>
        )}
      </div>

      <p className="m-0 mb-2 text-muted">
        Descarrega els fons de mapa (zoom 10-15) i el relleu d'aquesta ADF perquè el mapa funcioni
        sense cobertura.
      </p>

      {!bbox ? (
        <p className="m-0 text-muted">Cal calcular els límits de l'ADF abans de baixar el mapa.</p>
      ) : plan.exceedsLimit ? (
        <p className="m-0 text-muted">
          L'àrea és massa gran per descarregar-la de cop ({plan.tiles} tessel·les). Recalcula els
          límits o baixa el mapa de zones més petites.
        </p>
      ) : downloading ? (
        <>
          <div className="h-1.5 w-full bg-soft border border-border rounded-full overflow-hidden mb-1">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted">
              {progress.done}/{progress.total} tessel·les
            </span>
            <button onClick={() => abortRef.current?.abort()} className={`${secondaryButtonClass}`}>
              Cancel·la
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              void startDownload();
            }}
            className={`${primaryButtonClass} w-full`}
          >
            <ActionGlyph name="download" />
            {info ? "Tornar a baixar el mapa" : "Descarregar mapa"}
          </button>
          <p className="m-0 mt-1 text-xs text-muted">
            {plan.tiles} tessel·les · ~{MB_FORMAT.format(plan.bytes / 1_000_000)} MB
            {info ? ` · ${info.tiles} desades` : ""}
          </p>
        </>
      )}

      <p className="m-0 mt-2 text-xs text-muted">
        Es desa a la caché del navegador; si falta espai, el navegador la pot esborrar.
      </p>
    </section>
  );
}
