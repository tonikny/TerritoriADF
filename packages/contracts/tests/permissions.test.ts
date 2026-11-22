import { describe, expect, it } from "vitest";

import { ROLES, ROLE_PERMISSIONS, can, hasPermission, permissionsFor } from "../src/permissions.js";

describe("ROLE_PERMISSIONS", () => {
  it("té una entrada per a cada rol", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
    }
  });

  it("no repeteix cap permís dins d'un rol", () => {
    for (const role of ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(new Set(perms).size).toBe(perms.length);
    }
  });

  it("manté la jerarquia voluntari ⊆ coordinador ⊆ admin", () => {
    const coordinador = new Set(ROLE_PERMISSIONS.coordinador);
    const admin = new Set(ROLE_PERMISSIONS.admin);

    for (const permission of ROLE_PERMISSIONS.voluntari) {
      expect(coordinador.has(permission)).toBe(true);
    }
    for (const permission of ROLE_PERMISSIONS.coordinador) {
      expect(admin.has(permission)).toBe(true);
    }
  });

  it("dona a l'admin les capacitats globals", () => {
    expect(ROLE_PERMISSIONS.admin).toContain("manage_all_users");
    expect(ROLE_PERMISSIONS.admin).toContain("manage_adfs");
    expect(ROLE_PERMISSIONS.admin).toContain("sync_osm");
  });

  it("no dona al coordinador ni al voluntari res de global", () => {
    for (const permission of [
      "manage_adfs",
      "manage_all_users",
      "sync_osm",
      "view_all_positions",
    ] as const) {
      expect(ROLE_PERMISSIONS.coordinador).not.toContain(permission);
      expect(ROLE_PERMISSIONS.voluntari).not.toContain(permission);
    }
  });

  it("deixa el voluntari en edició bàsica de camp", () => {
    expect(ROLE_PERMISSIONS.voluntari).toEqual([
      "create_hydrant",
      "edit_hydrant",
      "view_own_adf_positions",
      "create_incidencia",
    ]);
  });

  it("no dona al voluntari ni la gestió d'usuaris ni l'esborrat d'hidrants", () => {
    expect(ROLE_PERMISSIONS.voluntari).not.toContain("manage_users");
    expect(ROLE_PERMISSIONS.voluntari).not.toContain("delete_hydrant");
  });
});

describe("permissionsFor", () => {
  it("retorna una còpia: mutar-la no toca la matriu", () => {
    const perms = permissionsFor("voluntari");
    perms.push("manage_all_users");

    expect(ROLE_PERMISSIONS.voluntari).not.toContain("manage_all_users");
    expect(permissionsFor("voluntari")).not.toContain("manage_all_users");
  });

  it("retorna una llista buida per a un rol desconegut", () => {
    expect(permissionsFor("inexistent")).toEqual([]);
  });
});

describe("hasPermission", () => {
  it("resol la capacitat pel rol", () => {
    expect(hasPermission("admin", "manage_adfs")).toBe(true);
    expect(hasPermission("coordinador", "manage_adfs")).toBe(false);
    expect(hasPermission("voluntari", "edit_hydrant")).toBe(true);
  });

  it("no dona res a un rol desconegut", () => {
    expect(hasPermission("inexistent", "edit_hydrant")).toBe(false);
  });
});

describe("can", () => {
  it("accepta la llista de capacitats que retorna /api/auth/me", () => {
    expect(can(ROLE_PERMISSIONS.coordinador, "manage_telegram")).toBe(true);
    expect(can(ROLE_PERMISSIONS.coordinador, "manage_adfs")).toBe(false);
  });

  it("tracta undefined i null com a usuari sense permisos", () => {
    expect(can(undefined, "sync_osm")).toBe(false);
    expect(can(null, "sync_osm")).toBe(false);
    expect(can([], "sync_osm")).toBe(false);
  });

  it("ignora capacitats desconegudes que arribin del servidor", () => {
    expect(can(["sync_osm", "capacitat_futura"], "sync_osm")).toBe(true);
  });
});
