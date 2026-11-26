import { compactSelectClass } from "@/styles/uiStyles";

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
      <h3 className="panel-title mb-2">Usuari</h3>
      <div className="border border-border rounded-lg p-3 bg-soft">
        <div className="font-semibold text-ink">{user.username}</div>
        <div className="text-muted text-sm capitalize mt-0.5">
          {actualRole === "admin" ? "admin" : user.role}
        </div>
        {user.adf_id !== null && (
          <div className="text-muted text-sm mt-0.5">{adfNom(user.adf_id)}</div>
        )}
        {actualRole === "admin" && (
          <label className="flex items-center gap-2 mt-2 text-sm">
            <span className="text-muted whitespace-nowrap">Veure com:</span>
            <select
              id="view-role"
              value={viewRole ?? "admin"}
              onChange={(e) => {
                const next = e.target.value as ViewRole;
                setViewRole(next === "admin" ? null : next);
              }}
              className={compactSelectClass}
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
