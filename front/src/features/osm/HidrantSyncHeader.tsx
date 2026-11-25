import { syncBadge, type SyncStatus } from "./syncBadge";

/** Badge d'estat, enllaç al node d'OSM i data de l'última sincronització. */
export function HidrantSyncHeader({
  status,
  osmId,
  syncedAt,
}: {
  status: SyncStatus;
  osmId?: number | null;
  syncedAt?: string | null;
}) {
  const badge = syncBadge(status);

  return (
    <>
      <div className="flex items-center justify-between">
        <span className={`${badge.cls} text-white text-[0.7rem] px-2 py-0.5 rounded font-semibold`}>
          {badge.text}
        </span>
        {osmId !== null && osmId !== undefined && osmId > 0 && (
          <a
            href={`https://www.openstreetmap.org/node/${osmId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.7rem] text-blue-600 hover:text-blue-800 hover:underline"
            title="Veure a OpenStreetMap"
          >
            OSM {osmId}
          </a>
        )}
      </div>
      {syncedAt && (
        <div className="text-[0.65rem] text-gray-500">
          Última sync: {new Date(syncedAt).toLocaleString("ca")}
        </div>
      )}
    </>
  );
}
