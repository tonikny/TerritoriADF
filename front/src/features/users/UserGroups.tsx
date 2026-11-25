import type { ManagedUser } from "@territoriadf/contracts/users";

import { primaryButtonClass } from "@/styles/uiStyles";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { UserDraftForm } from "./UserDraftForm";
import type { UserManagement } from "./useUserManagement";

/** Una fila d'usuari: accions d'enllaç, edició i esborrat segons el rol. */
function UserRow({
  m,
  user: u,
  currentUserId,
}: {
  m: UserManagement;
  user: ManagedUser;
  currentUserId: string;
}) {
  const isSelf = u.id === currentUserId;
  return (
    <div>
      <div className="flex justify-between items-center gap-2 px-3 py-2 border-t border-soft text-[0.85rem]">
        <div>
          <div className="font-medium text-ink">{u.username}</div>
          <div className="text-muted text-xs capitalize">{u.role}</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {!isSelf && (
            <button
              onClick={() => {
                void m.generateAccessLink(u);
              }}
              title="Generar enllaç d'accés"
              aria-label="Generar enllaç d'accés"
              className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
            >
              🔗
            </button>
          )}
          {(isSelf || u.adf_id !== null) && (
            <button
              onClick={() => (isSelf ? m.startSelfEdit() : m.startEdit(u))}
              className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
            >
              ✏️
            </button>
          )}
          {!isSelf && (
            <button
              onClick={() => {
                void m.del(u);
              }}
              className="bg-transparent border border-red-300 text-red-700 rounded px-2 py-1 cursor-pointer text-[0.8rem]"
            >
              🗑️
            </button>
          )}
        </div>
      </div>
      {m.editDraft && m.editDraft.username === u.username && (
        <UserDraftForm
          title={`Editar ${u.username} · ${m.adfNom(m.editDraft.adfId)}`}
          adfId={m.editDraft.adfId}
          draft={m.editDraft}
          roles={m.roles}
          submitting={m.submitting}
          submitLabel="Guardar"
          className="border-t border-primary bg-soft p-3"
          onChange={m.updateEditDraft}
          onSubmit={m.submitEdit}
          onCancel={m.cancelEdit}
        />
      )}
      {m.pwDraft && isSelf && (
        <PasswordChangeForm
          username={u.username}
          minPasswordLength={m.minPasswordLength}
          draft={m.pwDraft}
          submitting={m.pwSubmitting}
          onChange={m.updatePasswordDraft}
          onSubmit={m.submitPassword}
          onCancel={m.cancelPassword}
        />
      )}
    </div>
  );
}

/** Llistat agrupat per ADF; les portes de rol ja venen filtrades del hook. */
export function UserGroups({ m, currentUserId }: { m: UserManagement; currentUserId: string }) {
  return (
    <>
      {m.visibleGroups.map(([adfId, users]) => {
        const isOpen = m.expanded.includes(adfId);
        return (
          <div key={adfId} className="border border-border rounded mb-2 overflow-hidden">
            <div
              onClick={() => m.toggleGroup(adfId)}
              className="flex justify-between items-center gap-2 px-3 py-2 bg-soft cursor-pointer text-[0.85rem] font-medium"
            >
              <span>
                {adfId === 0 ? "Sense ADF" : m.adfNom(adfId)}{" "}
                <span className="text-muted font-normal">({users.length})</span>
              </span>
              <span className="flex items-center gap-2">
                {isOpen && adfId !== 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      m.startCreate(adfId);
                    }}
                    className={`${primaryButtonClass} p-1 px-2 text-xs`}
                  >
                    Nou
                  </button>
                )}
                <span className="text-muted">{isOpen ? "▾" : "▸"}</span>
              </span>
            </div>
            {isOpen && (
              <div>
                {users.map((u) => (
                  <UserRow key={u.id} m={m} user={u} currentUserId={currentUserId} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
