// @vitest-environment jsdom
//
// Selecció múltiple del panell d'OSM: la selecció creua seccions, les accions
// per lots reben exactament els IDs seleccionats i viuen a l'estat del
// component (no al del servidor). La descàrrega de pendents i les mutacions es
// mockegen a la frontera.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OsmPendingResponse, OsmSyncStats, PendingHidrant } from "@territoriadf/contracts/osm";

import { OsmSyncPanel } from "./OsmSyncPanel";

const api = vi.hoisted(() => ({ getOsmPending: vi.fn() }));
vi.mock("./api", () => api);

const actions = vi.hoisted(() => ({
  push: { mutateAsync: vi.fn(), isPending: false },
  discard: { mutateAsync: vi.fn(), isPending: false },
  pull: { mutateAsync: vi.fn(), isPending: false },
  purge: { mutateAsync: vi.fn(), isPending: false },
  pullSync: { mutateAsync: vi.fn(), isPending: false },
  isPending: false,
}));
vi.mock("./mutations", () => ({ useOsmMutations: () => actions }));

const ctx = vi.hoisted(() => ({
  activeAdf: { id: 278 } as { id: number } | null,
}));
vi.mock("@/contexts/AdfContext", () => ({ useAdf: () => ({ activeAdf: ctx.activeAdf }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: "admin" } }),
}));
vi.mock("react-toastify", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const STATS: OsmSyncStats = {
  SYNCED: 3,
  MISSING_IN_OSM: 0,
  PENDING_CREATE: 1,
  PENDING_UPDATE: 1,
  PENDING_DELETE: 0,
  CONFLICT: 0,
  ERROR: 0,
  REVIEW: 0,
  total_pending: 2,
};

const PENDING: PendingHidrant[] = [
  {
    id: "h1",
    osm_id: null,
    lat: 41.5,
    lon: 1.9,
    sync_status: "PENDING_CREATE",
    sync_error: null,
    street: "Carrer A",
    num: "1",
  },
  {
    id: "h2",
    osm_id: 123,
    lat: 41.6,
    lon: 2.0,
    sync_status: "PENDING_UPDATE",
    sync_error: null,
    street: "Carrer B",
    num: "2",
  },
];

const RESPONSE: OsmPendingResponse = { pending: PENDING, stats: STATS };

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OsmSyncPanel />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  ctx.activeAdf = { id: 278 };
});

describe("OsmSyncPanel", () => {
  it("puja exactament els hidrants seleccionats de diverses seccions", async () => {
    api.getOsmPending.mockResolvedValue(RESPONSE);
    actions.push.mutateAsync.mockResolvedValue({ synced: 2, conflicts: 0, errors: 0, reviewed: 0 });

    renderPanel();

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    boxes.forEach((box) => fireEvent.click(box));

    const pushButton = await screen.findByRole("button", { name: "Pujar (2)" });
    fireEvent.click(pushButton);

    await waitFor(() => expect(actions.push.mutateAsync).toHaveBeenCalledWith(["h1", "h2"]));
    // Després d'actuar, la selecció es buida i el botó desapareix.
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Pujar \(/ })).toBeNull());
  });

  it("no descarta res si l'usuari cancel·la la confirmació", async () => {
    api.getOsmPending.mockResolvedValue(RESPONSE);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPanel();

    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Descartar (1)" }));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(actions.discard.mutateAsync).not.toHaveBeenCalled();
  });

  it("descarta els seleccionats quan es confirma", async () => {
    api.getOsmPending.mockResolvedValue(RESPONSE);
    actions.discard.mutateAsync.mockResolvedValue({ discarded: 1, deleted: 0 });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderPanel();

    const boxes = await screen.findAllByRole("checkbox");
    fireEvent.click(boxes[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Descartar (1)" }));

    await waitFor(() => expect(actions.discard.mutateAsync).toHaveBeenCalledWith(["h2"]));
  });

  it("sense ADF activa no pinta res ni demana pendents", () => {
    ctx.activeAdf = null;
    const { container } = renderPanel();

    expect(container.firstChild).toBeNull();
    expect(api.getOsmPending).not.toHaveBeenCalled();
  });
});
