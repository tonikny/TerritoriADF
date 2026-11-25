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
      <h3 className="mt-5 mb-1 text-[0.95rem] font-semibold">
        Usuaris connectats ({users.length})
      </h3>
      {users.length === 0 ? (
        <p className="text-muted text-[0.85rem]">Cap usuari actiu ara mateix.</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {users.map((p) => (
            <li
              key={p.username}
              onClick={() => onCenter(p.username)}
              className="flex justify-between items-center px-3 py-2.5 border-b border-soft cursor-pointer hover:bg-soft"
              title="Centra el mapa en aquesta posició"
            >
              <span className="text-[0.9rem] font-medium text-ink">{p.username}</span>
              <span className="text-[0.8rem] text-muted">{timeAgo(p.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
