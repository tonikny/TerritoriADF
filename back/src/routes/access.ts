// Enllaç d'accés d'un sol ús:
//   GET  /api/auth/access/:token → només el nom d'usuari (per saludar a la pantalla)
//   POST /api/auth/access/:token → { password }: desa la contrasenya triada per l'usuari
//                                   i li deixa la sessió oberta.
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessTokens, adfs, users } from "../db/schema.js";
import type { ApiHandler } from "../types.js";
import { findAccessToken } from "../services/accessTokens.js";
import { passwordProblem } from "../utils/password.js";
import { toPublicUser } from "./auth.js";

type AccessTarget = { userId: string; tokenId: string } | { error: string; status: number };

/** Resol el token a un usuari, o retorna l'error que s'ha de mostrar a l'usuari. */
function resolveToken(rawToken: string | undefined): AccessTarget {
  if (!rawToken) {
    return { error: "Enllaç no vàlid", status: 404 };
  }

  const row = findAccessToken(rawToken);
  if (!row) {
    return {
      error: "Aquest enllaç no és vàlid. Demana'n un de nou al teu coordinador.",
      status: 404,
    };
  }
  if (row.used_at) {
    return {
      error: "Aquest enllaç ja s'ha fet servir. Si no has pogut entrar, demana'n un de nou.",
      status: 410,
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return {
      error: "Aquest enllaç ha caducat. Demana'n un de nou al teu coordinador.",
      status: 410,
    };
  }

  const user = db.select().from(users).where(eq(users.id, row.user_id)).get();
  if (!user) {
    return { error: "Aquest enllaç ja no és vàlid.", status: 404 };
  }
  return { userId: user.id, tokenId: row.id };
}

const info: ApiHandler = async (req, res) => {
  const target = resolveToken(req.params?.token);
  if ("error" in target) {
    return res.status(target.status).json({ error: target.error });
  }

  const user = db.select().from(users).where(eq(users.id, target.userId)).get();
  if (!user) {
    return res.status(404).json({ error: "Aquest enllaç ja no és vàlid." });
  }
  return res.json({ username: user.username });
};

const redeem: ApiHandler = async (req, res) => {
  const target = resolveToken(req.params?.token);
  if ("error" in target) {
    return res.status(target.status).json({ error: target.error });
  }

  const { password } = req.body ?? {};

  const user = db.select().from(users).where(eq(users.id, target.userId)).get();
  if (!user) {
    return res.status(404).json({ error: "Aquest enllaç ja no és vàlid." });
  }

  const adfNom = user.adf_id
    ? (db.select({ nom: adfs.nom }).from(adfs).where(eq(adfs.id, user.adf_id)).get()?.nom ?? null)
    : null;

  const problem = passwordProblem(password, "La contrasenya", {
    username: user.username,
    adfNom,
  });
  if (problem) {
    return res.status(400).json({ error: problem });
  }

  const hash = bcrypt.hashSync(password, 10);
  const usedAt = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(users).set({ password_hash: hash }).where(eq(users.id, user.id)).run();
    tx.update(accessTokens)
      .set({ used_at: usedAt })
      .where(eq(accessTokens.id, target.tokenId))
      .run();
  });

  const publicUser = toPublicUser(user);
  res._userToSign = {
    id: publicUser.id,
    username: publicUser.username,
    adf_id: publicUser.adf_id,
    role: publicUser.role,
  };

  req.log
    .child({ module: "auth", operation: "access_redeem" })
    .info({ username: user.username }, "Contrasenya creada per enllaç d'accés");

  return res.json({ user: publicUser });
};

const handler: ApiHandler = async (req, res) => {
  if (req.method === "GET") {
    return info(req, res);
  }
  if (req.method === "POST") {
    return redeem(req, res);
  }
  res.status(405).json({ error: "Method not allowed" });
};

export default handler;
