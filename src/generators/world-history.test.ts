import { describe, expect, it } from "vitest";
import { diffWorlds, sortVersions, territoryTable, type WorldSummary, type WorldVersion } from "./world-history";

const state = (i: number, name: string, provinces: number, extra = {}) => ({
  i,
  name,
  form: "Kingdom",
  capital: `${name} City`,
  provinces,
  area: 0,
  ...extra
});
const world = (over: Partial<WorldSummary> = {}): WorldSummary => ({
  states: [state(1, "Alia", 2), state(2, "Borea", 2)],
  owners: { 1: 1, 2: 1, 3: 2, 4: 2 },
  holders: {},
  provinceNames: { 1: "A1", 2: "A2", 3: "B1", 4: "B2" },
  wars: [],
  ...over
});

describe("world history", () => {
  it("orders versions by year, then by when they were saved", () => {
    const v = (id: string, year: number, savedAt: number) => ({ id, year, savedAt }) as WorldVersion;
    expect(sortVersions([v("c", 10, 5), v("a", -5, 9), v("b", 10, 1)]).map(x => x.id)).toEqual(["a", "b", "c"]);
  });

  it("finds nothing in two equal worlds", () => {
    expect(diffWorlds(world(), world())).toEqual([]);
  });

  it("sees founding, ending, renaming, forms and capitals", () => {
    const after = world({
      states: [state(1, "Alia", 2, { name: "Alian Union", form: "Republic", capital: "Newtown" }), state(3, "Cora", 0)]
    });
    const kinds = diffWorlds(world(), after).map(c => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["founded", "gone", "renamed", "form", "capital"]));
  });

  it("groups land that changed hands and occupation", () => {
    const after = world({ owners: { 1: 1, 2: 1, 3: 1, 4: 1 }, holders: {} });
    const gained = diffWorlds(world(), after).find(c => c.kind === "gained")!;
    expect(gained).toMatchObject({ state: "Alia", other: "Borea", count: 2 });
    const held = diffWorlds(world(), world({ holders: { 3: 1 } })).find(c => c.kind === "occupied")!;
    expect(held).toMatchObject({ state: "Alia", other: "Borea", count: 1 });
    const freed = diffWorlds(world({ holders: { 3: 1 } }), world()).find(c => c.kind === "liberated")!;
    expect(freed).toMatchObject({ state: "Borea", other: "Alia", count: 1 });
  });

  it("sees wars start and end", () => {
    expect(diffWorlds(world(), world({ wars: [[1, 2]] })).map(c => c.kind)).toEqual(["war"]);
    expect(diffWorlds(world({ wars: [[1, 2]] }), world()).map(c => c.kind)).toEqual(["peace"]);
  });

  it("tabulates the provinces of every state over the versions", () => {
    const v = (summary: WorldSummary) => ({ summary }) as WorldVersion;
    const table = territoryTable([v(world()), v(world({ states: [state(1, "Alia", 3), state(3, "Cora", 1)] }))]);
    expect(table.find(r => r.name === "Alia")!.counts).toEqual([2, 3]);
    expect(table.find(r => r.name === "Cora")!.counts).toEqual([null, 1]);
    expect(table.find(r => r.name === "Borea")!.counts).toEqual([2, null]);
  });
});
