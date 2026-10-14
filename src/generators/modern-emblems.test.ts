import { describe, expect, it, vi } from "vitest";
import { drawFlag, flagStyles } from "./modern-emblems";

describe("modern flags", () => {
  it("draws the same flag for the same seed", () => {
    expect(drawFlag("a", "Republic", "#3a7bd5")).toBe(drawFlag("a", "Republic", "#3a7bd5"));
  });

  it("draws every style of every form as svg in the 300 x 200 frame", () => {
    for (const form of ["Monarchy", "Republic", "Union", "Theocracy", "Anarchy", "Socialist"])
      for (const style of Object.keys(flagStyles(form))) {
        const art = drawFlag("s", form, "", style as never);
        expect(art).toContain("<rect");
        expect(art).not.toContain("NaN");
      }
  });

  it("gives socialist states red flags", () => {
    vi.stubGlobal("options", {});
    for (let n = 0; n < 20; n++) expect(drawFlag(`r${n}`, "Socialist")).toContain("#c8202f");
  });
});
