import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { useAdf } from "../../../contexts/AdfContext";
import { Login } from "../../shared/Login";
import { PasswordInput } from "../../shared/PasswordInput";
import { toast } from "react-toastify";
import { logError } from "../../../utils/log";
import {
  inputClass,
  selectClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../../styles/uiStyles";
import { adfLabel } from "../../../utils/adfLabel";
import { useAppConfig } from "../../../hooks/useAppConfig";

interface ManagedUser {
  id: string;
  username: string;
  adf_id: number | null;
  role: string;
}

const ROLES_ADMIN = ["admin", "coordinador", "voluntari"];
const ROLES_COORD = ["coordinador", "voluntari"];

type Draft = {
  numero: string;
  gi: boolean;
  role: string;
};

/** Enllaç d'accés acabat de generar: només es mostra un cop i no es pot recuperar. */
type AccessLink = { username: string; url: string; expires_at: string };

const pad3 = (n: number) => String(n).padStart(3, "0");
const prefixFor = (adfId: number, gi: boolean) => `${pad3(adfId)}/${gi ? "GI/" : ""}`;

function NumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
      placeholder="---"
      className="border border-border rounded text-base font-semibold w-[4ch] text-center py-0.5 bg-white"
    />
  );
}

export function UsuarisTab() {
  // Longitud mínima de contrasenya definida al backend (GET /api/config).
  const { minPasswordLength } = useAppConfig();
  const { user, logout, actualRole, viewRole, setViewRole } = useAuth();
  const { adfs } = useAdf();
  const isAdmin = user?.role === "admin";
  const canManage = isAdmin || user?.role === "coordinador";

  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [createAdf, setCreateAdf] = useState<number | null>(null);
  const [createDraft, setCreateDraft] = useState<Draft>({
    numero: "",
    gi: false,
    role: "voluntari",
  });
  const [accessLink, setAccessLink] = useState<AccessLink | null>(null);
  const [editDraft, setEditDraft] = useState<(Draft & { username: string; adfId: number }) | null>(
    null,
  );
  // Canvi de la contrasenya del propi usuari (només contrasenya: ni username ni rol).
  const [pwDraft, setPwDraft] = useState<{ current: string; next: string; repeat: string } | null>(
    null,
  );
  const [pwSubmitting, setPwSubmitting] = useState(false);

  useEffect(() => {
    if (!canManage) {
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, user?.adf_id]);

  async function load() {
    try {
      const r = await fetch("/api/users", { credentials: "same-origin" });
      if (!r.ok) {
        throw new Error(`API ${r.status}`);
      }
      setRows(await r.json());
    } catch (err) {
      logError("Error carregant usuaris", err);
    }
  }

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

  function startCreate(adfId: number) {
    setCreateAdf(adfId);
    setCreateDraft({ numero: "", gi: false, role: "voluntari" });
    setAccessLink(null);
    setEditDraft(null);
    setPwDraft(null);
  }

  function startEdit(u: ManagedUser) {
    const m = /^(\d{3})\/(?:GI\/)?(\d{3})$/.exec(u.username);
    setEditDraft({
      username: u.username,
      adfId: u.adf_id ?? 0,
      numero: m ? m[2] : "",
      gi: u.username.includes("/GI/"),
      role: u.role,
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

  async function doRequest<T = unknown>(url: string, method: string, body: unknown): Promise<T> {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data.error || `API ${r.status}`);
    }
    return data as T;
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (createAdf === null) {
      return;
    }
    setSubmitting(true);
    const username = `${prefixFor(createAdf, createDraft.gi)}${pad3(Math.min(Math.max(Number(createDraft.numero) || 0, 1), 999))}`;
    try {
      const created = await doRequest<{ access_url?: string; access_expires_at?: string }>(
        "/api/users",
        "POST",
        { username, role: createDraft.role },
      );
      toast.success(`Usuari ${username} creat`);
      if (created?.access_url && created.access_expires_at) {
        setAccessLink({ username, url: created.access_url, expires_at: created.access_expires_at });
      }
      setCreateAdf(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editDraft) {
      return;
    }
    setSubmitting(true);
    const username = `${prefixFor(editDraft.adfId, editDraft.gi)}${pad3(Math.min(Math.max(Number(editDraft.numero) || 0, 1), 999))}`;
    try {
      const target = rows.find((rr) => rr.username === editDraft.username)!;
      await doRequest(`/api/users/${target.id}`, "PUT", { username, role: editDraft.role });
      toast.success("Usuari actualitzat");
      setEditDraft(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPassword(e: React.FormEvent) {
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
      await doRequest("/api/auth/password", "PUT", {
        currentPassword: pwDraft.current,
        newPassword: pwDraft.next,
      });
      toast.success("Contrasenya actualitzada");
      setPwDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setPwSubmitting(false);
    }
  }

  /** Genera un enllaç d'un sol ús (invalida l'anterior) perquè l'usuari triï contrasenya. */
  async function generateAccessLink(u: ManagedUser) {
    try {
      const data = await doRequest<{
        username: string;
        access_url: string;
        access_expires_at: string;
      }>(`/api/users/${u.id}/access-link`, "POST", {});
      setAccessLink({
        username: data.username,
        url: data.access_url,
        expires_at: data.access_expires_at,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
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
      await doRequest(`/api/users/${u.id}`, "DELETE", {});
      toast.success("Usuari eliminat");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  if (!user) {
    return (
      <div className="p-4">
        <Login />
      </div>
    );
  }

  return (
    <div className="p-4">
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
              value={viewRole ?? "admin"}
              onChange={(e) =>
                setViewRole(
                  (e.target.value as "admin" | "coordinador" | "voluntari") === "admin"
                    ? null
                    : (e.target.value as "admin" | "coordinador" | "voluntari"),
                )
              }
              className={`${selectClass} max-w-36 px-1`}
            >
              <option value="admin">Admin</option>
              <option value="coordinador">Coordinador</option>
              <option value="voluntari">Voluntari</option>
            </select>
          </label>
        )}
      </div>
      <button onClick={logout} className={`${secondaryButtonClass} w-full mt-3`}>
        🔓 Tanca sessió
      </button>

      {canManage && (
        <div className="mt-4">
          <h4 className="m-0 mb-2 text-[0.9rem] font-semibold">Gestió d'usuaris</h4>

          {accessLink && (
            <div className="border border-primary rounded p-3 mb-3 bg-soft">
              <div className="text-[0.8rem] font-semibold mb-1">
                Enllaç d'accés · {accessLink.username}
              </div>
              <p className="m-0 mb-2 text-[0.75rem] text-muted">
                Envia'l per un canal privat (WhatsApp, Telegram o en mà). Caduca el{" "}
                {new Date(accessLink.expires_at).toLocaleString()} i només es pot fer servir un cop.
              </p>
              <input
                readOnly
                value={accessLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className={`${inputClass} bg-white`}
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    void copyLink(accessLink.url);
                  }}
                  className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem]`}
                >
                  Copiar enllaç
                </button>
                <button
                  type="button"
                  onClick={() => setAccessLink(null)}
                  className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
                >
                  Tanca
                </button>
              </div>
            </div>
          )}

          {createAdf !== null && (
            <form
              onSubmit={(e) => {
                void submitCreate(e);
              }}
              className="border border-primary rounded p-3 mb-3 bg-soft"
            >
              <div className="text-[0.8rem] font-semibold mb-2">
                Nou usuari · {adfNom(createAdf)}
              </div>
              <label className="block text-[0.8rem] italic mb-2">
                Número:
                <div className="flex gap-2 items-center mt-0.5">
                  <span className="text-base font-semibold whitespace-nowrap">
                    {prefixFor(createAdf, createDraft.gi)}
                  </span>
                  <NumberField
                    value={createDraft.numero}
                    onChange={(v) => setCreateDraft((d) => ({ ...d, numero: v }))}
                  />
                </div>
              </label>
              <label className="flex items-center gap-2 text-[0.8rem] mb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createDraft.gi}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, gi: e.target.checked }))}
                />
                Grup d'Intervenció (GI)
              </label>
              <label className="block text-[0.8rem] italic mb-2">
                Rol:
                <select
                  value={createDraft.role}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, role: e.target.value }))}
                  className={selectClass}
                >
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <p className="m-0 mb-2 text-[0.75rem] text-muted">
                En crear-lo es genera un enllaç d'accés i el voluntari hi tria la seva contrasenya:
                no cal escriure'n cap.
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
                >
                  {submitting ? "Guardant..." : "Crear"}
                </button>
                <button
                  type="button"
                  onClick={() => setCreateAdf(null)}
                  className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
                >
                  Cancel·la
                </button>
              </div>
            </form>
          )}

          {visibleGroups.map(([adfId, users]) => {
            const isOpen = expanded.includes(adfId);
            return (
              <div key={adfId} className="border border-border rounded mb-2 overflow-hidden">
                <div
                  onClick={() =>
                    setExpanded((c) => (isOpen ? c.filter((x) => x !== adfId) : [...c, adfId]))
                  }
                  className="flex justify-between items-center gap-2 px-3 py-2 bg-soft cursor-pointer text-[0.85rem] font-medium"
                >
                  <span>
                    {adfId === 0 ? "Sense ADF" : adfNom(adfId)}{" "}
                    <span className="text-muted font-normal">({users.length})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {isOpen && adfId !== 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startCreate(adfId);
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
                      <div key={u.id}>
                        <div className="flex justify-between items-center gap-2 px-3 py-2 border-t border-soft text-[0.85rem]">
                          <div>
                            <div className="font-medium text-ink">{u.username}</div>
                            <div className="text-muted text-xs capitalize">{u.role}</div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {u.id !== user.id && (
                              <button
                                onClick={() => {
                                  void generateAccessLink(u);
                                }}
                                title="Generar enllaç d'accés"
                                aria-label="Generar enllaç d'accés"
                                className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
                              >
                                🔗
                              </button>
                            )}
                            {(u.id === user.id || u.adf_id !== null) && (
                              <button
                                onClick={() => (u.id === user.id ? startSelfEdit() : startEdit(u))}
                                className="bg-transparent border border-border rounded px-2 py-1 cursor-pointer text-[0.8rem]"
                              >
                                ✏️
                              </button>
                            )}
                            {u.id !== user.id && (
                              <button
                                onClick={() => {
                                  void del(u);
                                }}
                                className="bg-transparent border border-red-300 text-red-700 rounded px-2 py-1 cursor-pointer text-[0.8rem]"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </div>
                        {editDraft && editDraft.username === u.username && (
                          <form
                            onSubmit={(e) => {
                              void submitEdit(e);
                            }}
                            className="border-t border-primary bg-soft p-3"
                          >
                            <div className="text-[0.8rem] font-semibold mb-2">
                              Editar {u.username} · {adfNom(editDraft.adfId)}
                            </div>
                            <label className="block text-[0.8rem] italic mb-2">
                              Número:
                              <div className="flex gap-2 items-center">
                                <span className="text-base font-semibold whitespace-nowrap">
                                  {prefixFor(editDraft.adfId, editDraft.gi)}
                                </span>
                                <NumberField
                                  value={editDraft.numero}
                                  onChange={(v) =>
                                    setEditDraft((d) => (d ? { ...d, numero: v } : d))
                                  }
                                />
                              </div>
                            </label>
                            <label className="flex items-center gap-2 text-[0.8rem] mb-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editDraft.gi}
                                onChange={(e) =>
                                  setEditDraft((d) => (d ? { ...d, gi: e.target.checked } : d))
                                }
                              />
                              Grup d'Intervenció (GI)
                            </label>
                            <label className="block text-[0.8rem] italic mb-2">
                              Rol:
                              <select
                                value={editDraft.role}
                                onChange={(e) =>
                                  setEditDraft((d) => (d ? { ...d, role: e.target.value } : d))
                                }
                                className={selectClass}
                              >
                                {roles.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="flex gap-2 mt-1">
                              <button
                                type="submit"
                                disabled={submitting}
                                className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
                              >
                                {submitting ? "Guardant..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditDraft(null)}
                                className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
                              >
                                Cancel·la
                              </button>
                            </div>
                          </form>
                        )}
                        {pwDraft && u.id === user.id && (
                          <form
                            onSubmit={(e) => {
                              void submitPassword(e);
                            }}
                            className="border-t border-primary bg-soft p-3"
                          >
                            <div className="text-[0.8rem] font-semibold mb-2">
                              Canviar contrasenya · {u.username}
                            </div>
                            <label className="block text-[0.8rem] italic mb-2">
                              Contrasenya actual:
                              <PasswordInput
                                autoComplete="current-password"
                                value={pwDraft.current}
                                onChange={(e) =>
                                  setPwDraft((d) => (d ? { ...d, current: e.target.value } : d))
                                }
                                className={`${inputClass} bg-white`}
                                required
                              />
                            </label>
                            <label className="block text-[0.8rem] italic mb-2">
                              Nova contrasenya:
                              <PasswordInput
                                autoComplete="new-password"
                                minLength={minPasswordLength}
                                value={pwDraft.next}
                                onChange={(e) =>
                                  setPwDraft((d) => (d ? { ...d, next: e.target.value } : d))
                                }
                                className={`${inputClass} bg-white`}
                                required
                              />
                            </label>
                            <label className="block text-[0.8rem] italic mb-2">
                              Repeteix la nova contrasenya:
                              <PasswordInput
                                autoComplete="new-password"
                                minLength={minPasswordLength}
                                value={pwDraft.repeat}
                                onChange={(e) =>
                                  setPwDraft((d) => (d ? { ...d, repeat: e.target.value } : d))
                                }
                                className={`${inputClass} bg-white`}
                                required
                              />
                            </label>
                            <div className="flex gap-2 mt-1">
                              <button
                                type="submit"
                                disabled={pwSubmitting}
                                className={`${primaryButtonClass} flex-1 p-2 text-[0.8rem] disabled:opacity-70`}
                              >
                                {pwSubmitting ? "Guardant..." : "Guardar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setPwDraft(null)}
                                className={`${secondaryButtonClass} flex-1 p-2 text-[0.8rem]`}
                              >
                                Cancel·la
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
