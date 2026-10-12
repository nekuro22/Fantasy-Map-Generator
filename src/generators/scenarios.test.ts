import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scenarios } from "./scenarios";

afterEach(() => vi.unstubAllGlobals());

const scenario = (id: string) =>
  JSON.parse(readFileSync(new URL(`../../public/scenarios/${id}.json`, import.meta.url), "utf8"));

describe("border scenarios", () => {
  it("are only loaded for the Earth presets with borders", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => scenario("1914") }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await Scenarios.prepare("continents")).toBe(false);
    expect(await Scenarios.prepare("earth")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await Scenarios.prepare("earth-1914")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("./scenarios/1914.json");
    expect(Scenarios.label).toBe("Earth 1914");
  });

  it("place known cities in the right country and keep every row the width of the globe", () => {
    for (const id of ["2026", "1945", "1938", "1930", "1914", "1200", "100"]) {
      const data = scenario(id);
      for (const runs of data.rows) {
        let width = 0;
        for (let k = 1; k < runs.length; k += 2) width += runs[k];
        expect(width).toBe(data.width);
      }
    }
    const at = (data: ReturnType<typeof scenario>, lon: number, lat: number) => {
      const x = Math.floor(((lon + 180) / 360) * data.width);
      const runs: number[] = data.rows[Math.floor(((90 - lat) / 180) * data.height)];
      let pos = 0;
      for (let k = 0; k < runs.length; k += 2) {
        if (pos + runs[k + 1] > x) {
          const region = data.regions[runs[k] - 1];
          return region && data.states[region.state - 1].name;
        }
        pos += runs[k + 1];
      }
    };
    expect(at(scenario("2026"), 13.4, 52.5)).toBe("Deutschland");
    expect(at(scenario("1914"), 13.4, 52.5)).toBe("German Empire");
    expect(at(scenario("1914"), 77.2, 28.6)).toBe("United Kingdom of Great Britain and Ireland"); // British Raj
    expect(at(scenario("100"), 12.5, 41.9)).toBe("Roman Empire");
  });
});
