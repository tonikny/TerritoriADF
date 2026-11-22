import { describe, expect, it } from "vitest";

import {
  hidrantUiFieldsSchema,
  mergeUiFieldsIntoTags,
  osm2Ui,
  sameOsmTags,
  ui2Osm,
  type HidrantOsmTags,
  type HidrantUiFields,
} from "../src/hidrants.js";

const BUIT: HidrantUiFields = {
  position: "",
  type: "",
  couplings: "",
  diameters: "",
  pressure: "",
  street: "",
  num: "",
  barri: "",
  surveyDate: "",
  estat: "",
};

function camps(overrides: Partial<HidrantUiFields> = {}): HidrantUiFields {
  return { ...BUIT, ...overrides };
}

describe("hidrantUiFieldsSchema", () => {
  it("omple amb cadenes buides els camps que no arriben", () => {
    const parsed = hidrantUiFieldsSchema.parse({ street: "Carrer Major" });
    expect(parsed.street).toBe("Carrer Major");
    expect(parsed.position).toBe("");
    expect(parsed.estat).toBe("");
  });

  it("rebutja valors més llargs que el límit del camp", () => {
    expect(hidrantUiFieldsSchema.safeParse({ street: "x".repeat(201) }).success).toBe(false);
    expect(hidrantUiFieldsSchema.safeParse({ street: "x".repeat(200) }).success).toBe(true);
  });
});

describe("osm2Ui", () => {
  it("tradueix els tags gestionats als camps del formulari", () => {
    const ui = osm2Ui({
      emergency: "fire_hydrant",
      "fire_hydrant:position": "sidewalk",
      "fire_hydrant:type": "underground",
      couplings: "2",
      "couplings:diameters": "80 mm; 100 mm",
      "fire_hydrant:pressure": "4",
      "addr:street": "Carrer Major",
      "addr:housenumber": "12",
      "addr:neighbourhood": "Centre",
      "survey:date": "2026-03-01",
    });

    expect(ui.position).toBe("sidewalk");
    expect(ui.type).toBe("underground");
    expect(ui.pressure).toBe("4");
    expect(ui.street).toBe("Carrer Major");
    expect(ui.surveyDate).toBe("2026-03-01");
    // Els diàmetres es desen amb unitat a OSM i es mostren sense.
    expect(ui.diameters).toBe("80;100");
    expect(ui.estat).toBe("Operatiu");
  });

  it("distingeix un hidrant fora de servei", () => {
    expect(osm2Ui({ "disused:emergency": "fire_hydrant" }).estat).toBe("Fora de servei");
  });

  it("retorna tots els camps buits si no hi ha tags, amb l'estat per defecte", () => {
    // Sense cap tag d'estat no es pot afirmar que estigui operatiu.
    expect(osm2Ui({})).toEqual({ ...BUIT, estat: "Desconegut" });
  });

  it("deixa 'Desconegut' quan no hi ha cap tag d'estat", () => {
    expect(osm2Ui({ "fire_hydrant:type": "pillar" }).estat).toBe("Desconegut");
  });
});

describe("ui2Osm", () => {
  it("descarta els tags amb valor buit", () => {
    const tags = ui2Osm(camps({ street: "Carrer Major" }));

    expect(tags["addr:street"]).toBe("Carrer Major");
    expect(tags).not.toHaveProperty("addr:housenumber");
    expect(tags).not.toHaveProperty("survey:date");
    expect(tags).not.toHaveProperty("fire_hydrant:pressure");
  });

  it("afegeix la unitat als diàmetres", () => {
    expect(ui2Osm(camps({ diameters: "45;100" }))["couplings:diameters"]).toBe("45 mm; 100 mm");
  });

  it("marca l'estat amb emergency o disused:emergency, mai els dos", () => {
    const operatiu = ui2Osm(camps({ estat: "Operatiu" }));
    expect(operatiu["emergency"]).toBe("fire_hydrant");
    expect(operatiu).not.toHaveProperty("disused:emergency");

    const fora = ui2Osm(camps({ estat: "Fora de servei" }));
    expect(fora["disused:emergency"]).toBe("fire_hydrant");
    expect(fora).not.toHaveProperty("emergency");
  });

  it("tracta un estat desconegut com un hidrant genèric (asimetria coneguda)", () => {
    // ui2Osm no pot expressar "estat desconegut" a OSM: el deixa com a hidrant
    // genèric i, en tornar a llegir-lo, consta com a operatiu. És el
    // comportament heretat; el test el fixa perquè un canvi sigui conscient.
    expect(ui2Osm(camps({ estat: "Desconegut" }))["emergency"]).toBe("fire_hydrant");
    expect(osm2Ui(ui2Osm(camps({ estat: "Desconegut" }))).estat).toBe("Operatiu");
  });
});

describe("osm2Ui(ui2Osm(camps))", () => {
  it("fa anada i tornada estable per als estats representables", () => {
    const ui = camps({
      position: "lane",
      type: "pillar",
      couplings: "2",
      diameters: "45;100",
      pressure: "yes",
      street: "Carrer Major",
      num: "12",
      barri: "Centre",
      surveyDate: "2026-01-02",
      estat: "Fora de servei",
    });

    expect(osm2Ui(ui2Osm(ui))).toEqual(ui);
  });

  it("normalitza el separador dels acoblaments a OSM", () => {
    const ui = camps({ couplings: "2", diameters: "45;100" });
    expect(osm2Ui(ui2Osm(ui)).diameters).toBe("45;100");
  });
});

describe("mergeUiFieldsIntoTags", () => {
  it("esborra els tags gestionats que queden buits i conserva els altres", () => {
    const actual: HidrantOsmTags = {
      "addr:street": "Carrer Vell",
      "fire_hydrant:type": "pillar",
      "survey:date": "2020-01-01",
      operator: "Ajuntament",
      image: "https://upload.wikimedia.org/x.jpg",
    };

    // Buidar un camp del formulari esborra el tag corresponent a OSM.
    const merged = mergeUiFieldsIntoTags(actual, camps({ street: "" }));

    expect(merged).not.toHaveProperty("addr:street");
    expect(merged).not.toHaveProperty("fire_hydrant:type");
    expect(merged).not.toHaveProperty("survey:date");
    // Els tags que no gestiona el formulari es mantenen intactes.
    expect(merged["operator"]).toBe("Ajuntament");
    expect(merged["image"]).toBe("https://upload.wikimedia.org/x.jpg");
  });

  it("manté l'ordre de les claus existents i afegeix les noves al final", () => {
    const actual: HidrantOsmTags = {
      operator: "Ajuntament",
      "addr:street": "Carrer Vell",
      "survey:date": "2020-01-01",
      image: "https://upload.wikimedia.org/x.jpg",
    };

    const merged = mergeUiFieldsIntoTags(
      actual,
      camps({ street: "Carrer Nou", surveyDate: "2026-01-01" }),
    );

    // L'ordre estable fa que comparar amb els tags desats no doni falsos canvis:
    // els existents es mantenen a lloc i els nous s'afegeixen al final.
    expect(Object.keys(merged)).toEqual([
      "operator",
      "addr:street",
      "survey:date",
      "image",
      "emergency",
    ]);
    expect(merged["addr:street"]).toBe("Carrer Nou");
    expect(merged["survey:date"]).toBe("2026-01-01");
  });

  it("afegeix els tags nous d'un hidrant sense tags previs", () => {
    expect(mergeUiFieldsIntoTags({}, camps({ street: "Carrer Major", estat: "Operatiu" }))).toEqual(
      {
        "addr:street": "Carrer Major",
        emergency: "fire_hydrant",
      },
    );
  });
});

describe("sameOsmTags", () => {
  it("ignora l'ordre de les claus", () => {
    expect(sameOsmTags({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
  });

  it("detecta valors diferents i claus de més o de menys", () => {
    expect(sameOsmTags({ a: "1" }, { a: "2" })).toBe(false);
    expect(sameOsmTags({ a: "1" }, { a: "1", b: "2" })).toBe(false);
    expect(sameOsmTags({}, {})).toBe(true);
  });
});
