// @vitest-environment jsdom
//
// Portes de rol de la pantalla d'usuaris: un voluntari no veu la gestió, un
// coordinador només veu la seva ADF i la vista «Veure com» és exclusiva de
// l'admin. Són les tres condicions que decideixen què pot fer cada rol i que
// fins ara només vivien dins del JSX.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ManagedUser } from "@territoriadf/contracts/users";

import { UsuarisTab } from "./UsuarisTab";

const state = vi.hoisted(() => ({
  user: {
    id: "u1",
    username: "278/GI/001",
    adf_id: 278 as number | null,
    role: "admin" as "admin" | "coordinador" | "voluntari",
  },
  rows: [] as ManagedUser[],
}));

const usersApi = vi.hoisted(() => ({ createAccessLink: vi.fn() }));
vi.mock("./api", () => usersApi);

vi.mock("./useUsers", () => ({
  useUsers: () => ({ data: state.rows }),
  useUserMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock("@/shared/api/auth", () => ({ changePassword: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: state.user,
    logout: vi.fn(),
    actualRole: state.user.role,
    viewRole: null,
    setViewRole: vi.fn(),
  }),
}));

vi.mock("@/contexts/AdfContext", () => ({
  useAdf: () => ({
    adfs: [
      { id: 278, nom: "Berguedà" },
      { id: 279, nom: "Osona" },
    ],
  }),
}));

vi.mock("@/contexts/AppConfigContext", () => ({ useAppConfig: () => ({ minPasswordLength: 12 }) }));

vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const ROWS: ManagedUser[] = [
  { id: "a", username: "278/001", adf_id: 278, role: "voluntari", created_at: null },
  { id: "b", username: "279/001", adf_id: 279, role: "voluntari", created_at: null },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.user = {
    id: "u1",
    username: "278/GI/001",
    adf_id: 278,
    role: "admin",
  };
  state.rows = [];
});

describe("UsuarisTab", () => {
  it("l'admin veu la gestió d'usuaris de totes les ADFs i pot veure com un altre rol", () => {
    state.rows = ROWS;
    render(<UsuarisTab />);

    expect(screen.getByText("Gestió d'usuaris")).toBeTruthy();
    expect(screen.getByText("Veure com:")).toBeTruthy();
    expect(screen.queryAllByText(/Berguedà/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Osona/).length).toBeGreaterThan(0);
  });

  it("el coordinador només veu els usuaris de la seva ADF i no pot canviar de visor", () => {
    state.user = {
      id: "u2",
      username: "278/001",
      adf_id: 278,
      role: "coordinador",
    };
    state.rows = ROWS;

    render(<UsuarisTab />);

    expect(screen.getByText("Gestió d'usuaris")).toBeTruthy();
    expect(screen.queryAllByText(/Berguedà/).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/Osona/)).toHaveLength(0);
    expect(screen.queryByText("Veure com:")).toBeNull();
  });

  it("el voluntari no veu cap gestió d'usuaris", () => {
    state.user = {
      id: "u3",
      username: "278/002",
      adf_id: 278,
      role: "voluntari",
    };
    state.rows = ROWS;

    render(<UsuarisTab />);

    expect(screen.getByText("278/002")).toBeTruthy();
    expect(screen.queryByText("Gestió d'usuaris")).toBeNull();
    expect(screen.queryByText("Veure com:")).toBeNull();
  });
});
