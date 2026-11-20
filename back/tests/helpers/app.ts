import type { FastifyInstance } from "fastify";

import { buildApp } from "../../src/app.js";
import { TEST_PASSWORD } from "./db.js";

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

/** Aplicació real, sense `listen()`: tot passa per `app.inject()`. */
export async function createTestApp(): Promise<FastifyInstance> {
  return buildApp();
}

/** Capçalera `cookie` a partir de la resposta de login (o de l'enllaç d'accés). */
export function sessionCookie(response: InjectResponse): string {
  const cookie = response.cookies.find((c) => c.name === "auth_token");
  if (!cookie?.value) {
    throw new Error(
      `Resposta sense cookie auth_token (${response.statusCode}): ${response.body.slice(0, 300)}`,
    );
  }
  return `auth_token=${cookie.value}`;
}

export async function login(
  app: FastifyInstance,
  username: string,
  password = TEST_PASSWORD,
): Promise<InjectResponse> {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password },
  });
}

/** Login que ha de funcionar; retorna la capçalera `cookie` llesta per injectar. */
export async function loginCookie(
  app: FastifyInstance,
  username: string,
  password = TEST_PASSWORD,
): Promise<string> {
  const response = await login(app, username, password);
  if (response.statusCode !== 200) {
    throw new Error(
      `Login de ${username} ha fallat (${response.statusCode}): ${response.body.slice(0, 300)}`,
    );
  }
  return sessionCookie(response);
}
