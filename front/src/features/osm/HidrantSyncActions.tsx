import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

import { HidrantActionButtons } from "./HidrantActionButtons";
import { HidrantSyncHeader } from "./HidrantSyncHeader";
import { HidrantSyncNotices } from "./HidrantSyncNotices";
import { useHidrantDiff } from "./useHidrantDiff";
import { useHidrantSyncActions } from "./useHidrantSyncActions";

/**
 * Estat de sync d'un hidrant amb OSM dins del bottomsheet: capçalera, avisos i
 * accions. El diff i les accions viuen en hooks; això només compon.
 */
export function HidrantSyncActions({ feature }: { feature: HidrantFeature }) {
  const { id, sync_status, sync_error, osm_id, synced_at } = feature.properties;
  const sync = useHidrantSyncActions(feature);
  const { diff, diffLoading } = useHidrantDiff({
    id,
    syncStatus: sync_status,
    syncError: sync_error,
    osmId: osm_id,
  });

  return (
    <div className="border border-border rounded p-2 flex flex-col gap-2">
      <HidrantSyncHeader status={sync_status} osmId={osm_id} syncedAt={synced_at} />
      <HidrantSyncNotices
        status={sync_status}
        error={sync_error}
        diff={diff}
        diffLoading={diffLoading}
        osmId={osm_id}
      />
      {sync_status !== "SYNCED" && (
        <HidrantActionButtons
          status={sync_status}
          isPending={sync.isPending}
          onPush={() => {
            void sync.push();
          }}
          onPull={() => {
            void sync.pull();
          }}
          onDiscard={() => {
            void sync.discard();
          }}
        />
      )}
    </div>
  );
}
