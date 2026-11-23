import fastifyCookie, { type CookieSerializeOptions } from "@fastify/cookie";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { UsersRepository } from "../db/repositories/usersRepository.js";
import { config } from "../utils/config.js";

/** Usuari de sessió: el rol i l'ADF es rellegeixen de la BD a cada petició. */
export type SessionUser = {
  id: string;
  username: string;
  adf_id: number | null;
  role: string;
};

/** Contingut del JWT de sessió: només identificació + versió del token. */
export type SessionPayload = SessionUser & { tv: number };

declare module "fastify" {
  interface FastifyRequest {
    /** Usuari de la sessió per a aquesta petició; `null` si la petició és anònima. */
    authUser: SessionUser | null;
  }
}

const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 dies

/**
 * Atributs de la cookie de sessió (compartits entre login, logout i canvi de
 * contrasenya): han de coincidir perquè el navegador accepti esborrar una
 * cookie `Secure`/`SameSite`.
 */
export function sessionCookieOptions(request: FastifyRequest): CookieSerializeOptions {
  const options: CookieSerializeOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  };

  // Si estem en producció o l'usuari accedeix per HTTPS, marquem la cookie com a segura
  if (
    process.env.NODE_ENV === "production" ||
    request.protocol === "https" ||
    request.headers["x-forwarded-proto"] === "https"
  ) {
    options.secure = true;
  }

  return options;
}

/**
 * Signa el JWT i el deixa a la cookie httpOnly. El token només viatja a la
 * cookie: no es retorna al cos (evita que quedi a localStorage o als logs).
 */
export function setSessionCookie(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  payload: SessionPayload,
): void {
  // Caducitat explícita: el JWT viu el mateix que la cookie.
  const token = app.jwt.sign(payload, { expiresIn: "30d" });
  reply.setCookie("auth_token", token, {
    ...sessionCookieOptions(request),
    maxAge: SESSION_MAX_AGE_S,
  });
}

export function clearSessionCookie(request: FastifyRequest, reply: FastifyReply): void {
  reply.clearCookie("auth_token", sessionCookieOptions(request));
}

/**
 * Usuari de sessió fresc de la BD. El JWT només serveix per identificar l'usuari
 * (id + versió del token): el rol i l'ADF es llegeixen de `users` a cada petició,
 * així un canvi de rol o un usuari esborrat tenen efecte immediat en lloc
 * d'esperar l'expiració de la cookie (30 dies). Un canvi de contrasenya
 * incrementa `token_version` i invalida totes les cookies anteriors (inclosa una
 * robada). Els tokens antics sense `tv` s'accepten com a versió 0 (migració
 * transparent).
 */
function sessionUser(payload: unknown): SessionUser | null {
  const data = payload as { id?: unknown; tv?: unknown } | null | undefined;
  const id = data?.id;
  if (typeof id !== "string") {
    return null;
  }

  const row = UsersRepository.findById(id);
  if (!row) {
    return null;
  }

  const tokenVersion = typeof data?.tv === "number" ? data.tv : 0;
  if ((row.token_version ?? 0) !== tokenVersion) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    adf_id: row.adf_id,
    role: row.role ?? "voluntari",
  };
}

/**
 * Registra cookie + JWT i resol `request.authUser` a l'onRequest de cada
 * petició (també les públiques: `/api/hidrants` i `/api/incidencies` exposen
 * dades addicionals quan hi ha sessió).
 *
 * S'invoca directament des de `buildApp()` i no amb `app.register()`: els
 * decoradors i hooks han de quedar a l'arrel perquè les rutes els vegin.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie);

  await app.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: {
      cookieName: "auth_token",
      signed: false,
    },
  });

  app.decorateRequest("authUser", null);

  app.addHook("onRequest", async (request) => {
    request.authUser = null;

    try {
      await request.jwtVerify();
    } catch {
      return;
    }

    let user = sessionUser(request.user);
    if (!user) {
      return;
    }

    // Mode "veure com": només un admin pot degradar el seu rol efectiu (mai escalar-lo)
    // i simular pertinença a l'ADF activa. El front envia `x-view-role:
    // coordinador|voluntari` + `x-view-adf-id` quan l'admin previsualitza un altre rol;
    // així el backend aplica les mateixes restriccions (p. ex. visibilitat d'incidències)
    // que tindria aquell rol en aquella ADF. Un admin ja ho pot tot, de manera que
    // restringir-se a un rol/ADF concrets mai és una escalada de privilegis; les
    // capçaleres s'ignoren per a qualsevol sessió no-admin.
    const viewRole = request.headers["x-view-role"];
    if (user.role === "admin" && (viewRole === "coordinador" || viewRole === "voluntari")) {
      const rawViewAdf = request.headers["x-view-adf-id"];
      const viewAdfId =
        typeof rawViewAdf === "string" && /^\d+$/.test(rawViewAdf.trim())
          ? Number(rawViewAdf.trim())
          : null;
      user = { ...user, role: viewRole, adf_id: viewAdfId };
    }

    request.authUser = user;
  });
}
