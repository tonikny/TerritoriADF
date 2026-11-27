import { secondaryButtonClass } from "@/styles/uiStyles";
import { Glyph } from "@/shared/ui/Glyphs";
import { AccessLinkPanel } from "./AccessLinkPanel";
import { Login } from "./Login";
import { UserAccountCard } from "./UserAccountCard";
import { UserDraftForm } from "./UserDraftForm";
import { UserGroups } from "./UserGroups";
import { useUserManagement } from "./useUserManagement";

/**
 * Pantalla d'usuari i gestió. L'estat i les accions viuen a
 * `useUserManagement`; aquí només es compon la vista.
 */
export function UsuarisTab() {
  const m = useUserManagement();
  const currentUser = m.user;

  if (!currentUser) {
    return (
      <div className="p-4">
        <Login />
      </div>
    );
  }

  return (
    <div className="p-4">
      <UserAccountCard
        user={currentUser}
        actualRole={m.actualRole}
        viewRole={m.viewRole}
        setViewRole={m.setViewRole}
        adfNom={m.adfNom}
      />
      <button onClick={m.logout} className={`${secondaryButtonClass} w-full mt-3`}>
        <Glyph name="lock" size={16} />
        Tanca sessió
      </button>

      {m.canManage && (
        <div className="mt-4">
          <h4 className="m-0 mb-2 text-sm font-semibold">Gestió d'usuaris</h4>

          {m.accessLink && (
            <AccessLinkPanel link={m.accessLink} onCopy={m.copyLink} onClose={m.closeAccessLink} />
          )}

          {m.createAdf !== null && (
            <UserDraftForm
              title={`Nou usuari · ${m.adfNom(m.createAdf)}`}
              adfId={m.createAdf}
              draft={m.createDraft}
              roles={m.roles}
              submitting={m.submitting}
              submitLabel="Crear"
              className="border border-primary rounded-lg p-3 mb-3 bg-soft"
              footnote="En crear-lo es genera un enllaç d'accés i el voluntari hi tria la seva contrasenya: no cal escriure'n cap."
              onChange={m.updateCreateDraft}
              onSubmit={m.submitCreate}
              onCancel={m.cancelCreate}
            />
          )}

          <UserGroups m={m} currentUserId={currentUser.id} />
        </div>
      )}
    </div>
  );
}
