import type { ManagedUser } from "@territoriadf/contracts/users";

import { iconButtonClass, primaryButtonClass } from "@/styles/uiStyles";
import { ActionGlyph } from "@/shared/ui/Glyphs";
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
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-t border-soft text-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-ink">{u.username}</div>
          <div className="text-muted text-xs capitalize">{u.role}</div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {!isSelf && (
            <button
              onClick={() => {
                void m.generateAccessLink(u);
              }}
              aria-label="Generar contrasenya d'accés"
              title="Generar contrasenya d'accés"
              className={iconButtonClass}
            >
              <ActionGlyph name="key" />
            </button>
          )}
          {(isSelf || u.adf_id !== null) && (
            <button
              onClick={() => (isSelf ? m.startSelfEdit() : m.startEdit(u))}
              aria-label="Editar l'usuari"
              title="Editar l'usuari"
              className={iconButtonClass}
            >
              <ActionGlyph name="edit" />
            </button>
          )}
          {!isSelf && (
            <button
              onClick={() => {
                void m.del(u);
              }}
              aria-label="Esborrar l'usuari"
              title="Esborrar l'usuari"
              className={`${iconButtonClass} border-alert/40 text-alert`}
            >
              <ActionGlyph name="trash" />
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
          <div
            key={adfId}
            className="border border-border-strong rounded-lg shadow-control mb-2 overflow-hidden"
          >
            <div
              onClick={() => m.toggleGroup(adfId)}
              aria-expanded={isOpen}
              className="flex justify-between items-center gap-2 px-3 py-2 bg-white hover:bg-soft cursor-pointer text-base font-semibold leading-tight"
            >
              <span>
                {adfId === 0 ? "Sense ADF" : m.adfNom(adfId)}{" "}
                <span className="text-muted">({users.length})</span>
              </span>
              <span className="flex items-center gap-2">
                {isOpen && adfId !== 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      m.startCreate(adfId);
                    }}
                    className={primaryButtonClass}
                  >
                    Nou
                  </button>
                )}
                <span
                  aria-hidden
                  className={`text-xs text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
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
