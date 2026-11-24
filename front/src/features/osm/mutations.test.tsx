// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { useOsmMutations } from "./mutations";

const api = vi.hoisted(() => ({
  pushToOsm: vi.fn(),
  discardOsmChanges: vi.fn(),
  pullHydrantFromOsm: vi.fn(),
  purgeMissingFromOsm: vi.fn(),
  syncAdfFromOsm: vi.fn(),
}));

vi.mock("./api", () => api);

const ctx = vi.hoisted(() => ({
  activeAdf: { id: 278 } as { id: number } | null,
  user: { id: "u1", role: "admin" } as { id: string; role: string } | null,
}));

vi.mock("@/contexts/AdfContext", () => ({ useAdf: () => ({ activeAdf: ctx.activeAdf }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: ctx.user }) }));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const viewer = viewerKey(ctx.user);
  client.setQueryData(queryKeys.hidrants(278, viewer), []);
  client.setQueryData(queryKeys.osmPending(278, viewer), { pending: [] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useOsmMutations(), { wrapper });
  return { client, result, viewer };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useOsmMutations", () => {
  it("en pujar canvis invalida hidrants i pendents d'OSM", async () => {
    api.pushToOsm.mockResolvedValue({ synced: 1 });
    const { client, result, viewer } = setup();

    await act(async () => {
      await result.current.push.mutateAsync(["h1"]);
    });

    expect(api.pushToOsm).toHaveBeenCalledWith(["h1"], expect.anything());
    expect(client.getQueryState(queryKeys.hidrants(278, viewer))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.osmPending(278, viewer))?.isInvalidated).toBe(true);
  });

  it("purga els hidrants absents d'OSM amb l'ADF activa", async () => {
    api.purgeMissingFromOsm.mockResolvedValue({ deleted: 2 });
    const { result } = setup();

    await act(async () => {
      await result.current.purge.mutateAsync(["a", "b"]);
    });

    expect(api.purgeMissingFromOsm).toHaveBeenCalledWith(278, ["a", "b"]);
  });
});
