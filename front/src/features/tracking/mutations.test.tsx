// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OtrcConfig } from "@territoriadf/contracts/tracking";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { useTrackingMutations } from "./mutations";

const api = vi.hoisted(() => ({
  enableTracking: vi.fn(),
  setAdfTrackingSharing: vi.fn(),
}));

vi.mock("@/shared/api/tracking", () => ({ enableTracking: api.enableTracking }));
vi.mock("@/shared/api/adfs", () => ({ setAdfTrackingSharing: api.setAdfTrackingSharing }));

const auth = vi.hoisted(() => ({
  user: { id: "u1", role: "coordinador" } as { id: string; role: string } | null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: auth.user }),
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(queryKeys.adfs, []);
  client.setQueryData(queryKeys.trackingStatus(viewerKey(auth.user)), {
    available: true,
    enabled: false,
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useTrackingMutations(), { wrapper });
  return { client, result };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useTrackingMutations", () => {
  it("en activar OwnTracks invalida l'estat de tracking", async () => {
    api.enableTracking.mockResolvedValue({} as OtrcConfig);
    const { client, result } = setup();

    await act(async () => {
      await result.current.enable.mutateAsync();
    });

    expect(
      client.getQueryState(queryKeys.trackingStatus(viewerKey(auth.user)))?.isInvalidated,
    ).toBe(true);
  });

  it("en canviar la compartició invalida la llista d'ADFs", async () => {
    api.setAdfTrackingSharing.mockResolvedValue({ adf_id: 278, tracking_shared: true });
    const { client, result } = setup();

    await act(async () => {
      await result.current.setSharing.mutateAsync({ adfId: 278, shared: true });
    });

    expect(api.setAdfTrackingSharing).toHaveBeenCalledWith(278, true);
    expect(client.getQueryState(queryKeys.adfs)?.isInvalidated).toBe(true);
  });
});
