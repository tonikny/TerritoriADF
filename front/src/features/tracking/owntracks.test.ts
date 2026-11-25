import { describe, expect, it } from "vitest";

import { owntracksConfigHref, toBase64 } from "./owntracks";

describe("owntracks", () => {
  it("sense configuració retorna la URL d'importació nua", () => {
    expect(owntracksConfigHref(null)).toBe("owntracks:///config");
  });

  it("codifica la configuració en base64 dins de la query", () => {
    const href = owntracksConfigHref({ url: "mqtt://example" });
    const inline = new URL(href).searchParams.get("inline");

    expect(href.startsWith("owntracks:///config?inline=")).toBe(true);
    expect(inline).toBe(toBase64(JSON.stringify({ url: "mqtt://example" })));
    expect(atob(inline!)).toBe('{"url":"mqtt://example"}');
  });

  it("el base64 va percent-encodat: cap `+` cru que OwnTracks convertiria en espai", () => {
    // "???" en UTF-8 és 0x3f...; amb accents el base64 pot contenir `+`
    const href = owntracksConfigHref({ nom: "Berguedà óú" });
    const raw = href.slice(href.indexOf("inline=") + "inline=".length);
    expect(raw).not.toContain("+");
  });
});
