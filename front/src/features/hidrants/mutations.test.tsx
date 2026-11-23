// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { invalidateHidrantQueries, useCreateHidrant } from "./mutations";

const api = vi.hoisted(() => ({ createHidrant: vi.fn() }));

vi.mock("@/shared/api/hidrants", () => api);

const ctx = vi.hoisted(() => ({
  activeAdf: { id: 278 } as { id: number } | null,
  user: { id: "u1", role: "coordinador" } as { id: string; role: string } | null,
}));

vi.mock("@/contexts/AdfContext", () => ({ useAdf: () => ({ activeAdf: ctx.activeAdf }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: ctx.user }) }));

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useCreateHidrant", () => {
  it("crea a l'ADF activa i invalida hidrants i pendents d'OSM", async () => {
    api.createHidrant.mockResolvedValue({} as HidrantFeature);
    const client = createClient();
    const viewer = viewerKey(ctx.user);
    client.setQueryData(queryKeys.hidrants(278, viewer), []);
    client.setQueryData(queryKeys.osmPending(278, viewer), { pending: [] });

    const { result } = renderHook(() => useCreateHidrant(), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ lat: 41.5, lon: 1.8 });
    });

    expect(api.createHidrant).toHaveBeenCalledWith(278, { lat: 41.5, lon: 1.8 });
    expect(client.getQueryState(queryKeys.hidrants(278, viewer))?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.osmPending(278, viewer))?.isInvalidated).toBe(true);
  });
});

describe("invalidateHidrantQueries", () => {
  it("sense ADF activa només invalida els pendents d'OSM", async () => {
    const client = createClient();
    const viewer = viewerKey(ctx.user);
    client.setQueryData(queryKeys.osmPending(278, viewer), { pending: [] });

    await act(async () => {
      await invalidateHidrantQueries(client, null, viewer);
    });

    expect(client.getQueryState(queryKeys.osmPending(278, viewer))?.isInvalidated).toBe(true);
  });
});
