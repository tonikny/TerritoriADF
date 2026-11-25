// Estat i accions de la pantalla d'usuaris. La vista (`UsuarisTab`) només
// compon: aquí viuen l'alta, l'edició, els enllaços d'accés, la contrasenya
// pròpia i les portes de rol, que abans vivien dins del JSX.
import type { ManagedUser } from "@territoriadf/contracts/users";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "react-toastify";

import { useAdf } from "@/contexts/AdfContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { useAuth } from "@/contexts/AuthContext";
import { changePassword } from "@/shared/api/auth";
import { adfLabel } from "@/utils/adfLabel";
import { createAccessLink } from "./api";
import { buildUsername, parseUsername } from "./userIdentity";
import { useUserMutations, useUsers } from "./useUsers";

const ROLES_ADMIN = ["admin", "coordinador", "voluntari"];
const ROLES_COORD = ["coordinador", "voluntari"];

export type UserDraft = {
  numero: string;
  gi: boolean;
  role: string;
};

/** Enllaç d'accés acabat de generar: només es mostra un cop i no es pot recuperar. */
export type AccessLink = { username: string; url: string; expires_at: string };

export type UserDraftEdit = UserDraft & { username: string; adfId: number };

export type PasswordDraft = { current: string; next: string; repeat: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : "Error");

export function useUserManagement() {
  // Longitud mínima de contrasenya definida al backend (GET /api/config).
  const { minPasswordLength } = useAppConfig();
  const { user, logout, actualRole, viewRole, setViewRole } = useAuth();
  const { adfs } = useAdf();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "coordinador";

  const usersQuery = useUsers(canManage);
  const rows = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const mutations = useUserMutations();
  const submitting =
    mutations.create.isPending || mutations.update.isPending || mutations.remove.isPending;

  const [expanded, setExpanded] = useState<number[]>([]);
  const [createAdf, setCreateAdf] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<UserDraft>({
    numero: "",
    gi: false,
    role: "voluntari",
  });
  const [accessLink, setAccessLink] = useState<AccessLink | null>(null);
  const [editDraft, setEditDraft] = useState<UserDraftEdit | null>(null);
  // Canvi de la contrasenya del propi usuari (només contrasenya: ni username ni rol).
  const [pwDraft, setPwDraft] = useState<PasswordDraft | null>(null);
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<number, ManagedUser[]>();
    for (const u of rows) {
      const k = u.adf_id ?? 0;
      if (!map.has(k)) {
        map.set(k, []);
      }
      map.get(k)!.push(u);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  const adfNom = (id: number) => {
    const found = adfs.find((a) => a.id === id);
    return found ? adfLabel(found.id, found.nom) : `ADF ${id}`;
  };
  const roles = isAdmin ? ROLES_ADMIN : ROLES_COORD;

  // Defensa extra: un coordinador només veu la seva ADF a la llista d'usuaris.
  const visibleGroups =
    user?.role === "coordinador" && user.adf_id !== null
      ? groups.filter(([adfId]) => adfId === user.adf_id)
      : groups;

  function toggleGroup(adfId: number) {
    setExpanded((current) =>
      current.includes(adfId) ? current.filter((x) => x !== adfId) : [...current, adfId],
    );
  }

  function startCreate(adfId: number) {
    setCreateAdf(adfId);
    setCreateDraft({ numero: "", gi: false, role: "voluntari" });
    setAccessLink(null);
    setEditDraft(null);
    setPwDraft(null);
  }

  function startEdit(u: ManagedUser) {
    const { numero, gi } = parseUsername(u.username);
    setEditDraft({
      username: u.username,
      adfId: u.adf_id ?? 0,
      numero,
      gi,
      role: u.role ?? "voluntari",
    });
    setCreateAdf(null);
    setPwDraft(null);
  }

  /** El propi usuari només pot canviar la seva contrasenya (ni username ni rol). */
  function startSelfEdit() {
    setEditDraft(null);
    setCreateAdf(null);
    setPwDraft({ current: "", next: "", repeat: "" });
  }

  function updateCreateDraft(patch: Partial<UserDraft>) {
    setCreateDraft((draft) => ({ ...draft, ...patch }));
  }

  function updateEditDraft(patch: Partial<UserDraft>) {
    setEditDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  }

  function updatePasswordDraft(patch: Partial<PasswordDraft>) {
    setPwDraft((draft) => (draft ? { ...draft, ...patch } : draft));
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (createAdf === null) {
      return;
    }
    const username = buildUsername(createAdf, createDraft.gi, createDraft.numero);
    try {
      const created = await mutations.create.mutateAsync({
        username,
        role: createDraft.role,
      });
      toast.success(`Usuari ${username} creat`);
      if (created?.access_url && created.access_expires_at) {
        setAccessLink({ username, url: created.access_url, expires_at: created.access_expires_at });
      }
      setCreateAdf(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editDraft) {
      return;
    }
    const username = buildUsername(editDraft.adfId, editDraft.gi, editDraft.numero);
    try {
      const target = rows.find((row) => row.username === editDraft.username);
      if (!target) {
        throw new Error("Usuari no trobat a la llista");
      }
      await mutations.update.mutateAsync({
        id: target.id,
        input: { username, role: editDraft.role },
      });
      toast.success("Usuari actualitzat");
      setEditDraft(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!pwDraft) {
      return;
    }
    if (pwDraft.next !== pwDraft.repeat) {
      toast.error("Les contrasenyes noves no coincideixen");
      return;
    }
    setPwSubmitting(true);
    try {
      await changePassword({
        currentPassword: pwDraft.current,
        newPassword: pwDraft.next,
      });
      toast.success("Contrasenya actualitzada");
      setPwDraft(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPwSubmitting(false);
    }
  }

  /** Genera un enllaç d'un sol ús (invalida l'anterior) perquè l'usuari triï contrasenya. */
  async function generateAccessLink(u: ManagedUser) {
    try {
      const data = await createAccessLink(u.id);
      setAccessLink({
        username: data.username,
        url: data.access_url,
        expires_at: data.access_expires_at,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enllaç copiat");
    } catch {
      toast.error("No s'ha pogut copiar; selecciona'l a mà");
    }
  }

  async function del(u: ManagedUser) {
    if (!window.confirm(`Eliminar l'usuari ${u.username}?`)) {
      return;
    }
    try {
      await mutations.remove.mutateAsync(u.id);
      toast.success("Usuari eliminat");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return {
    user,
    actualRole,
    viewRole,
    setViewRole,
    logout,
    canManage,
    minPasswordLength,
    roles,
    visibleGroups,
    adfNom,
    submitting,
    expanded,
    toggleGroup,
    createAdf,
    createDraft,
    updateCreateDraft,
    editDraft,
    updateEditDraft,
    pwDraft,
    pwSubmitting,
    updatePasswordDraft,
    accessLink,
    closeAccessLink: () => setAccessLink(null),
    startCreate,
    startEdit,
    startSelfEdit,
    cancelCreate: () => setCreateAdf(null),
    cancelEdit: () => setEditDraft(null),
    cancelPassword: () => setPwDraft(null),
    submitCreate,
    submitEdit,
    submitPassword,
    generateAccessLink,
    copyLink,
    del,
  };
}

export type UserManagement = ReturnType<typeof useUserManagement>;
