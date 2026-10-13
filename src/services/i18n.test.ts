import { describe, expect, it } from "vitest";
import { translate } from "./i18n";

const dictionary = { Cancel: "Abbrechen", "Total population: {n}K; Urban: {n}": "Gesamt: {n}K; Stadt: {n}" };

describe("translate", () => {
  it("translates whole strings and keeps surrounding space", () => {
    expect(translate("Cancel", dictionary)).toBe("Abbrechen");
    expect(translate("  Cancel\n", dictionary)).toBe("  Abbrechen\n");
  });

  it("carries numbers over into templates", () => {
    expect(translate("Total population: 12.5K; Urban: 1,204", dictionary)).toBe("Gesamt: 12.5K; Stadt: 1,204");
  });

  it("leaves unknown text, names and numbers alone", () => {
    expect(translate("Kingdom of Aurelia", dictionary)).toBe("Kingdom of Aurelia");
    expect(translate("1,204", dictionary)).toBe("1,204");
    expect(translate("Cancel", undefined)).toBe("Cancel");
  });

  it("has a German entry for every placeholder it keeps", async () => {
    const de: Record<string, string> = (await import("@/data/i18n/de.json")).default;
    for (const [key, value] of Object.entries(de)) expect(value.split("{n}").length, key).toBe(key.split("{n}").length);
  });
});
