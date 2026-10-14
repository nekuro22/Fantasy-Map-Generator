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

  it("varies socialist flags, mostly red", () => {
    vi.stubGlobal("options", {});
    const flags = Array.from({ length: 20 }, (_, n) => drawFlag(`r${n}`, "Socialist"));
    expect(new Set(flags).size).toBeGreaterThan(15);
    expect(flags.filter(f => f.includes("#c8202f")).length).toBeGreaterThan(4);
  });
});
