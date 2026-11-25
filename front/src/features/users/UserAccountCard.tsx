import { selectClass } from "@/styles/uiStyles";

type ViewRole = "admin" | "coordinador" | "voluntari";

/** Targeta amb la identitat efectiva i el selector «Veure com» (només admin). */
export function UserAccountCard({
  user,
  actualRole,
  viewRole,
  setViewRole,
  adfNom,
}: {
  user: { username: string; adf_id: number | null; role: string | null };
  actualRole: string | null;
  viewRole: ViewRole | null;
  setViewRole: (role: ViewRole | null) => void;
  adfNom: (id: number) => string;
}) {
  return (
    <>
      <h3 className="m-0 mb-2 text-[0.95rem] font-semibold">Usuari</h3>
      <div className="border border-border rounded p-3 bg-soft">
        <div className="font-semibold text-ink">{user.username}</div>
        <div className="text-muted text-[0.8rem] capitalize mt-0.5">
          {actualRole === "admin" ? "admin" : user.role}
        </div>
        {user.adf_id !== null && (
          <div className="text-muted text-[0.8rem] mt-0.5">{adfNom(user.adf_id)}</div>
        )}
        {actualRole === "admin" && (
          <label className="flex items-center gap-2 mt-2 text-[0.8rem]">
            <span className="text-muted">Veure com:</span>
            <select
              id="view-role"
              value={viewRole ?? "admin"}
              onChange={(e) => {
                const next = e.target.value as ViewRole;
                setViewRole(next === "admin" ? null : next);
              }}
              className={`${selectClass} max-w-36 px-1`}
            >
              <option value="admin">Administrador</option>
              <option value="coordinador">Coordinador</option>
              <option value="voluntari">Voluntari</option>
            </select>
          </label>
        )}
      </div>
    </>
  );
}
