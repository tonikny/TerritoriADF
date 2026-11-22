import { describe, expect, it } from "vitest";
import { getHidrantImages } from "./hidrantDisplay";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("getHidrantImages", () => {
  it("accepta UUID de Panoramax i construeix URLs del host canònic", () => {
    const images = getHidrantImages({ panoramax: UUID });
    expect(images).toHaveLength(1);
    expect(images[0].type).toBe("panoramax");
    expect(images[0].url).toBe(`https://api.panoramax.xyz/api/pictures/${UUID}/hd.jpg`);
  });

  it("rebutja valors de panoramax que no són UUID (path traversal)", () => {
    expect(getHidrantImages({ panoramax: "../../admin" })).toHaveLength(0);
    expect(getHidrantImages({ panoramax: `${UUID}/../../evil` })).toHaveLength(0);
    expect(getHidrantImages({ panoramax: "no-és-un-uuid" })).toHaveLength(0);
  });

  it("accepta image=https d'hosts permesos i rebutja la resta", () => {
    const ok = getHidrantImages({
      image: "https://upload.wikimedia.org/wikipedia/commons/1/2/hidrant.jpg",
    });
    expect(ok).toHaveLength(1);

    expect(getHidrantImages({ image: "http://upload.wikimedia.org/x.jpg" })).toHaveLength(0);
    expect(getHidrantImages({ image: "https://evil.example.com/hidrant.jpg" })).toHaveLength(0);
    expect(getHidrantImages({ image: "javascript:alert(1)" })).toHaveLength(0);
    expect(
      getHidrantImages({ image: "https://user:pass@upload.wikimedia.org/x.jpg" }),
    ).toHaveLength(0);
  });
});
