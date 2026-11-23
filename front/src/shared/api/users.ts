// Gestió d'usuaris (GET/POST/PUT/DELETE /api/users) i enllaços d'accés.
import type { AccessLink, CreatedUser, ManagedUser } from "@territoriadf/contracts/users";

import { request } from "./client";

export function getUsers(signal?: AbortSignal): Promise<ManagedUser[]> {
  return request<ManagedUser[]>("/api/users", { signal });
}

export function createUser(input: { username: string; role: string }): Promise<CreatedUser> {
  return request<CreatedUser>("/api/users", { method: "POST", body: input });
}

export async function updateUser(
  id: string,
  input: { username?: string; role?: string },
): Promise<void> {
  await request<unknown>(`/api/users/${encodeURIComponent(id)}`, { method: "PUT", body: input });
}

export async function deleteUser(id: string): Promise<void> {
  await request<unknown>(`/api/users/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createAccessLink(id: string): Promise<AccessLink> {
  return request<AccessLink>(`/api/users/${encodeURIComponent(id)}/access-link`, {
    method: "POST",
  });
}
