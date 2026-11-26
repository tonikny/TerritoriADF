import { timeAgo } from "@/utils/time";

/** Usuaris amb posició recent; clicar-ne un centra el mapa. */
export function ConnectedUsersList({
  users,
  onCenter,
}: {
  users: { username: string; ts: number }[];
  onCenter: (username: string) => void;
}) {
  return (
    <>
      <h3 className="mt-0 mb-1 flex items-center gap-2 text-base font-semibold">
        Usuaris connectats
        {/* Mateix badge que els recomptes d'hidrants i incidències. */}
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold leading-tight text-ink">
          {users.length}
        </span>
      </h3>
      <div className="rounded-lg border border-soft overflow-hidden">
        {users.length === 0 ? (
          <p className="m-0 px-3 py-2 text-sm text-muted">Cap usuari actiu ara mateix.</p>
        ) : (
          <ul className="m-0 p-0 list-none divide-y divide-soft">
            {users.map((p) => (
              <li
                key={p.username}
                onClick={() => onCenter(p.username)}
                className="flex justify-between items-center px-3 py-2.5 cursor-pointer hover:bg-soft"
                title="Centra el mapa en aquesta posició"
              >
                <span className="text-sm font-medium text-ink">{p.username}</span>
                <span className="text-sm text-muted">{timeAgo(p.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
