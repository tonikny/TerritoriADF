import type { Adf } from "@/contexts/AdfContext";
import { adfLabel } from "@/utils/adfLabel";

/** Compartir (o no) les posicions OwnTracks de l'ADF amb la resta d'ADFs. */
export function TrackingShareToggle({
  adf,
  shared,
  saving,
  onToggle,
}: {
  adf: Adf;
  shared: boolean;
  saving: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="mt-4 border border-border rounded-lg p-3">
      <h4 className="m-0 mb-1 text-sm font-semibold">
        Compartir tracking ({adfLabel(adf.id, adf.nom)})
      </h4>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={shared}
          disabled={saving}
          onChange={(e) => onToggle(e.target.checked)}
        />
        Permetre que altres ADFs vegin les posicions OwnTracks d'aquesta ADF
      </label>
    </div>
  );
}
