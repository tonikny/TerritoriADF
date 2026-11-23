import type { Position } from "@territoriadf/contracts/tracking";

import { timeAgo } from "@/utils/time";

/** Popup d'una unitat OwnTracks al mapa. */
export function TrackingPopup({ username, position }: { username: string; position: Position }) {
  return (
    <div className="whitespace-nowrap text-[0.8rem] leading-[1.3]">
      <strong>{username}</strong>
      <br />
      bateria: {position.battery}%<br />
      precisió: {position.accuracy}m<br />
      {timeAgo(position.receivedAt || position.timestamp * 1000)}
    </div>
  );
}
