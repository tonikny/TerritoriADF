import { describe, expect, it } from "vitest";

import {
  buildChangesetXml,
  buildNodeCreateXml,
  buildNodeDeleteXml,
  buildNodeUpdateXml,
  buildOscXml,
} from "../src/services/osmXml.js";

describe("buildChangesetXml", () => {
  it("inclou el comentari, l'autoria i la font survey", () => {
    const xml = buildChangesetXml("TerritoriADF: alta d'hidrant (ADF 278)");

    expect(xml).toContain("<changeset>");
    expect(xml).toContain("TerritoriADF: alta d'hidrant (ADF 278)");
    expect(xml).toContain("created_by");
    expect(xml).toContain("source");
    expect(xml).toContain("survey");
  });
});

describe("buildNodeCreateXml", () => {
  it("crea un node sense id ni versió i escapa els tags", () => {
    const xml = buildNodeCreateXml(
      41.6,
      1.6,
      { "addr:street": "Carrer & Principal", "survey:date": "2026-01-15", buit: "" },
      123,
    );

    expect(xml).toContain('<node lat="41.6" lon="1.6" changeset="123">');
    expect(xml).not.toMatch(/<node[^>]*id=/);
    expect(xml).not.toMatch(/<node[^>]*version=/);
    expect(xml).toContain("Carrer &amp; Principal");
    expect(xml).not.toContain('k="buit"');
  });
});

describe("buildNodeUpdateXml", () => {
  it("inclou id i versió del node existent", () => {
    const xml = buildNodeUpdateXml(7001, 3, 41.6, 1.6, { emergency: "fire_hydrant" }, 123);

    expect(xml).toContain('id="7001"');
    expect(xml).toContain('version="3"');
    expect(xml).toContain('changeset="123"');
    expect(xml).toContain("fire_hydrant");
  });
});

describe("buildNodeDeleteXml", () => {
  it("no inclou cap tag", () => {
    const xml = buildNodeDeleteXml(7001, 3, 123);

    expect(xml).toContain('id="7001"');
    expect(xml).toContain('version="3"');
    expect(xml).not.toContain("<tag");
  });
});

describe("buildOscXml", () => {
  it("genera un osmChange amb les operacions i els tags", () => {
    const xml = buildOscXml([
      {
        action: "modify",
        osmId: 7001,
        version: 4,
        lat: 41.6,
        lon: 1.6,
        tags: { "addr:street": "Carrer OSM" },
        changesetId: 0,
      },
      {
        action: "delete",
        osmId: 7002,
        version: 2,
        lat: 41.6,
        lon: 1.6,
        tags: { emergency: "fire_hydrant" },
        changesetId: 0,
      },
    ]);

    expect(xml).toContain("<osmChange");
    expect(xml).toContain("<modify>");
    expect(xml).toContain("<delete>");
    expect(xml).toContain('id="7001"');
    expect(xml).toContain("Carrer OSM");
    expect(xml).toContain('id="7002"');
  });
});
