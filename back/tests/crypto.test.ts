import { describe, expect, it } from "vitest";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { decrypt, encrypt } from "../src/utils/crypto.js";

/**
 * `utils/crypto.ts` xifra les contrasenyes MQTT i els tokens de Telegram a la
 * BD. Un error aquí no el detecta cap altra capa: o no es pot desxifrar res, o
 * es desxifra amb una clau que no toca. Els tests fixen el contracte del
 * format `iv:authTag:enc` i que una clau diferent no obri el payload.
 */

/** Xifra amb una clau arbitrària, amb el mateix format que `encrypt()`. */
function encryptWith(secret: string, plaintext: string): string {
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${enc}`;
}

describe("crypto", () => {
  it("desxifra el que ha xifrat (anada i tornada)", () => {
    const plaintext = "contrasenya-super-secreta-123";

    const encrypted = encrypt(plaintext);

    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("xifra el mateix text de manera diferent cada vegada (IV aleatori)", () => {
    const a = encrypt("mqtt-password");
    const b = encrypt("mqtt-password");

    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("mqtt-password");
    expect(decrypt(b)).toBe("mqtt-password");
  });

  it("accepta un text buit i caràcters no ASCII", () => {
    expect(decrypt(encrypt(""))).toBe("");
    const plaintext = 'secret amb accents: àèíòú · "cometes" · 日本語';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("retorna null amb una clau diferent de la que va xifrar", () => {
    const encrypted = encryptWith("una-alta-clau-de-32-caracters-0001", "token-telegram");

    expect(decrypt(encrypted)).toBeNull();
  });

  it("retorna null si el payload s'ha manipulat", () => {
    const [iv, authTag, enc] = encrypt("token").split(":") as [string, string, string];
    // Canviem l'últim byte sense risc que coincideixi amb l'original ("00"):
    // amb un valor aleatori, un de cada 256 cops el test no manipulava res.
    const lastByte = enc.slice(-2);
    const tampered = `${iv}:${authTag}:${enc.slice(0, -2)}${lastByte === "00" ? "01" : "00"}`;

    expect(decrypt(tampered)).toBeNull();
  });

  it("retorna null amb un format invàlid", () => {
    expect(decrypt("")).toBeNull();
    expect(decrypt("sense-separadors")).toBeNull();
    expect(decrypt("només:dues")).toBeNull();
    expect(decrypt("zz:zz:zz")).toBeNull();
  });
});
