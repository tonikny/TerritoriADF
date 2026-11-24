// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { TelegramStatusResponse } from "@territoriadf/contracts/telegram";
import { queryKeys } from "@/shared/query/keys";
import { useTelegramActions, useTelegramStatus } from "./useTelegram";

const api = vi.hoisted(() => ({
  getTelegramStatus: vi.fn(),
  registerTelegramBot: vi.fn(),
  createTelegramLink: vi.fn(),
  sendTelegramTest: vi.fn(),
  deleteTelegram: vi.fn(),
}));

vi.mock("./api", () => api);

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

describe("useTelegramStatus", () => {
  it("consulta l'estat de l'ADF quan està habilitat", async () => {
    const status: TelegramStatusResponse = {
      status: "CONFIGURAT",
      bot_username: "bot",
      bot_name: "Bot",
      group_name: "Grup",
    };
    api.getTelegramStatus.mockResolvedValue(status);

    const { result } = renderHook(() => useTelegramStatus(278, true), {
      wrapper: wrapperFor(createClient()),
    });

    await waitFor(() => expect(result.current.data).toEqual(status));
    expect(api.getTelegramStatus).toHaveBeenCalledWith(278, expect.anything());
  });

  it("no consulta res mentre el panell no és visible", async () => {
    const { result } = renderHook(() => useTelegramStatus(278, false), {
      wrapper: wrapperFor(createClient()),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(api.getTelegramStatus).not.toHaveBeenCalled();
  });
});

describe("useTelegramActions", () => {
  it("desa a la caché l'estat retornat en validar el bot", async () => {
    const registered: TelegramStatusResponse = {
      status: "BOT_CONFIGURAT",
      bot_username: "bot",
      bot_name: "Bot",
      group_name: null,
    };
    api.registerTelegramBot.mockResolvedValue(registered);
    const client = createClient();

    const { result } = renderHook(() => useTelegramActions(278), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      await result.current.register.mutateAsync("123:token");
    });

    expect(api.registerTelegramBot).toHaveBeenCalledWith(278, "123:token");
    expect(client.getQueryData(queryKeys.telegramStatus(278))).toEqual(registered);
  });

  it("en generar l'enllaç marca GRUP_PENDENT sense perdre el nom del bot", async () => {
    api.createTelegramLink.mockResolvedValue({
      url: "https://t.me/bot?startgroup=code",
      expires_at: "2026-12-01T00:00:00.000Z",
      bot_username: "bot",
      bot_name: "Bot",
    });
    const client = createClient();
    client.setQueryData(queryKeys.telegramStatus(278), {
      status: "BOT_CONFIGURAT",
      bot_username: "bot",
      bot_name: "Bot",
      group_name: "Grup antic",
    } satisfies TelegramStatusResponse);

    const { result } = renderHook(() => useTelegramActions(278), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      await result.current.link.mutateAsync();
    });

    expect(client.getQueryData(queryKeys.telegramStatus(278))).toEqual({
      status: "GRUP_PENDENT",
      bot_username: "bot",
      bot_name: "Bot",
      group_name: "Grup antic",
    });
  });

  it("en desconnectar deixa l'estat net a la caché", async () => {
    api.deleteTelegram.mockResolvedValue(undefined);
    const client = createClient();
    client.setQueryData(queryKeys.telegramStatus(278), {
      status: "CONFIGURAT",
      bot_username: "bot",
      bot_name: "Bot",
      group_name: "Grup",
    } satisfies TelegramStatusResponse);

    const { result } = renderHook(() => useTelegramActions(278), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      await result.current.remove.mutateAsync();
    });

    expect(client.getQueryData(queryKeys.telegramStatus(278))).toEqual({
      status: "NO_CONFIGURAT",
      bot_username: null,
      bot_name: null,
      group_name: null,
    });
  });
});
