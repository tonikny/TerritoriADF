import { EventEmitter } from "node:events";
import type { MqttClient } from "mqtt";
import { vi } from "vitest";

/**
 * Client MQTT fals per als tests: un `EventEmitter` amb els mètodes que fan
 * servir `dynsec.ts` i `mqtt.ts`. La subscripció crida el callback de seguida,
 * com el broker local; `publish` no envia res tret que el test ho munti.
 */
export type FakeMqttClient = EventEmitter & {
  connected: boolean;
  subscribe: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};

export function createFakeMqttClient(): FakeMqttClient {
  const client = Object.assign(new EventEmitter(), {
    connected: true,
    subscribe: vi.fn(),
    publish: vi.fn(),
    end: vi.fn(),
  }) as FakeMqttClient;

  client.subscribe.mockImplementation((...args: unknown[]) => {
    const callback = args[2] as ((err?: Error) => void) | undefined;
    callback?.();
    return client;
  });

  return client;
}

export function asMqttClient(client: FakeMqttClient): MqttClient {
  return client as unknown as MqttClient;
}
