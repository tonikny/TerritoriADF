// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { CreatedUser, ManagedUser } from "@territoriadf/contracts/users";
import { useUserMutations, useUsers } from "./useUsers";

const api = vi.hoisted(() => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("./api", () => api);

const auth = vi.hoisted(() => ({
  user: { id: "u1", role: "coordinador" } as { id: string; role: string } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

const rows: ManagedUser[] = [
  { id: "x", username: "278/001", adf_id: 278, role: "voluntari", created_at: null },
];

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useUsers", () => {
  it("carrega els usuaris del visor actual", async () => {
    api.getUsers.mockResolvedValue(rows);
    const { result } = renderHook(() => useUsers(true), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toEqual(rows));
    expect(api.getUsers).toHaveBeenCalledTimes(1);
  });

  it("en crear un usuari invalida la llista i la torna a demanar", async () => {
    const created: CreatedUser = {
      ...rows[0],
      id: "y",
      username: "278/002",
      access_url: "https://example.test/access/token",
      access_expires_at: "2026-12-01T00:00:00.000Z",
    };
    api.getUsers.mockResolvedValue(rows);
    api.createUser.mockResolvedValue(created);

    const { result } = renderHook(() => ({ list: useUsers(true), mutations: useUserMutations() }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.list.data).toEqual(rows));

    await act(async () => {
      await result.current.mutations.create.mutateAsync({
        username: "278/002",
        role: "voluntari",
      });
    });

    await waitFor(() => expect(api.getUsers).toHaveBeenCalledTimes(2));
  });
});
