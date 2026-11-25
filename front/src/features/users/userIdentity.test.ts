import { describe, expect, it } from "vitest";

import { buildUsername, clampNumero, parseUsername, prefixFor } from "./userIdentity";

describe("userIdentity", () => {
  it("prefixa l'ADF a tres xifres amb GI opcional", () => {
    expect(prefixFor(278, false)).toBe("278/");
    expect(prefixFor(45, true)).toBe("045/GI/");
  });

  it("construeix usernames amb el número ajustat al rang 1–999", () => {
    expect(buildUsername(278, false, "7")).toBe("278/007");
    expect(buildUsername(45, true, "12")).toBe("045/GI/012");
    expect(buildUsername(278, false, "")).toBe("278/001");
    expect(buildUsername(278, false, "1500")).toBe("278/999");
  });

  it("aclareix números no numèrics com feia el camp de text", () => {
    expect(clampNumero("0")).toBe("001");
    expect(clampNumero("12a")).toBe("001");
  });

  it("desfà el username cap als camps del formulari d'edició", () => {
    expect(parseUsername("278/GI/001")).toEqual({ numero: "001", gi: true });
    expect(parseUsername("278/042")).toEqual({ numero: "042", gi: false });
    expect(parseUsername("admin")).toEqual({ numero: "", gi: false });
  });
});
