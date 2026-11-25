import { describe, expect, it } from "vitest";

import { botUsernameExample } from "./telegramBot";

describe("botUsernameExample", () => {
  it("treu el prefix ADF i uneix les dues primeres paraules", () => {
    expect(botUsernameExample({ id: 278, nom: "ADF Bergueda" })).toBe("adf_278_bergueda_bot");
    expect(botUsernameExample({ id: 45, nom: "ADF Alt Urgell" })).toBe("adf_45_alt_urgell_bot");
  });

  it("retalla la segona paraula quan el nom d'usuari seria massa llarg", () => {
    expect(botUsernameExample({ id: 278, nom: "ADF Maresme Occidental i Valles" })).toBe(
      "adf_278_maresme_bot",
    );
  });

  it("funciona sense nom", () => {
    expect(botUsernameExample({ id: 7 })).toBe("adf_7__bot");
  });
});
