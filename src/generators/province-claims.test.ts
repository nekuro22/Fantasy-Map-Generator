import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  await import("./provinces-generator");
});

// a row of six land cells: state 1 owns 1–3 (provinces 1, 2, 3), state 2 owns 4–6 (provinces 4, 5, 6)
const row = (diplomacy: string) => {
  const state = [0, 1, 1, 1, 2, 2, 2];
  return {
    cells: {
      i: [0, 1, 2, 3, 4, 5, 6],
      c: [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5]],
      state: Uint16Array.from(state),
      province: Uint16Array.from([0, 1, 2, 3, 4, 5, 6])
    },
    burgs: [0, { i: 1, cell: 1 }, { i: 2, cell: 6 }],
    states: [
      { i: 0 },
      { i: 1, capital: 1, rural: 900, urban: 100, diplomacy: ["x", "x", diplomacy] },
      { i: 2, capital: 2, rural: 90, urban: 10, diplomacy: ["x", diplomacy, "x"] }
    ],
    provinces: [0, ...[1, 2, 3, 4, 5, 6].map(i => ({ i, state: state[i], cores: [state[i]] }))]
  };
};

describe("automatic occupation", () => {
  beforeEach(() => vi.stubGlobal("options", { map: { seed: "claims" } }));

  it("lets the stronger side hold the enemy's border province, never its capital", () => {
    vi.stubGlobal("pack", row("Enemy"));
    const occupied = Provinces.generateOccupation();
    const controllers = pack.provinces.slice(1).map(p => p.controller);
    expect(occupied).toBeGreaterThan(0);
    expect(controllers[3]).toBe(1); // province 4 borders state 1
    expect(controllers[5]).toBeUndefined(); // province 6 holds state 2's capital
    expect(controllers.slice(0, 3).every(c => c === undefined)).toBe(true);
  });

  it("occupies nothing without wars and is the same every time", () => {
    vi.stubGlobal("pack", row("Neutral"));
    expect(Provinces.generateOccupation()).toBe(0);
    vi.stubGlobal("pack", row("Enemy"));
    Provinces.generateOccupation();
    const first = pack.provinces.map(p => p?.controller);
    vi.stubGlobal("pack", row("Enemy"));
    Provinces.generateOccupation();
    expect(pack.provinces.map(p => p?.controller)).toEqual(first);
  });

  it("keeps the map's own random sequence untouched", () => {
    vi.stubGlobal("pack", row("Enemy"));
    const random = Math.random;
    Provinces.generateOccupation();
    expect(Math.random).toBe(random);
  });
});

describe("automatic claims", () => {
  beforeEach(() => vi.stubGlobal("options", { map: { seed: "claims" } }));

  it("gives a neighbor a claim where its people live, never a second core", () => {
    const map = row("Neutral");
    map.states[1] = { ...map.states[1], culture: 1 } as unknown as (typeof map.states)[number];
    map.states[2] = { ...map.states[2], culture: 2 } as unknown as (typeof map.states)[number];
    Object.assign(map.cells, { culture: Uint16Array.from([0, 1, 1, 1, 1, 2, 2]) }); // province 4 is of culture 1
    vi.stubGlobal("pack", map);
    Provinces.generateClaims();
    const p = pack.provinces[4];
    const ok = (p.cores?.[0] === 2 && p.claims?.includes(1)) || (p.cores?.[0] === 1 && p.claims?.includes(2));
    expect(ok).toBe(true);
    expect(pack.provinces.slice(1).every(p => p.cores?.length === 1)).toBe(true);
  });

  it("lets an occupier claim what it holds", () => {
    vi.stubGlobal("pack", row("Enemy"));
    Provinces.generateOccupation();
    Provinces.generateClaims();
    for (const p of pack.provinces.slice(1)) if (p.controller) expect(p.claims).toContain(p.controller);
  });
});

describe("regions", () => {
  beforeEach(() => vi.stubGlobal("options", { map: { seed: "regions" } }));

  // one state of eight provinces in a row
  const strip = () => {
    const ids = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    return {
      cells: {
        i: ids,
        c: ids.map(i => [i - 1, i + 1].filter(n => n >= 1 && n <= 8)),
        p: ids.map(i => [i * 10, 0]),
        state: Uint16Array.from(ids.map(i => (i ? 1 : 0))),
        province: Uint16Array.from(ids)
      },
      burgs: [0, { i: 1, cell: 1, name: "Vel" }],
      states: [{ i: 0 }, { i: 1, capital: 1, color: "#3366aa", form: "Republic", formName: "Federal Republic" }],
      provinces: [0, ...ids.slice(1).map(i => ({ i, state: 1, center: i, burg: i === 1 ? 1 : 0, name: `P${i}` }))]
    };
  };

  it("groups a state's provinces into compact regions named after their seats", () => {
    vi.stubGlobal("pack", strip());
    expect(Provinces.generateRegions()).toBeGreaterThanOrEqual(2);
    const regions = pack.provinces.slice(1).map(p => p.region);
    expect(regions.every(Boolean)).toBe(true);
    // compact: along the row a region never comes back once left
    const order = regions.filter((r, k) => r !== regions[k - 1]);
    expect(new Set(order).size).toBe(order.length);
    expect(pack.states[1].regions![0]).toMatchObject({ i: 1, name: "Vel" });
    expect(["Land", "State"]).toContain(pack.states[1].regions![0].formName);
  });

  it("adds, renames, assigns and removes regions", () => {
    vi.stubGlobal("pack", strip());
    const id = Provinces.addRegion(1, "Nord", "Land");
    expect(Provinces.region(1, id)?.fullName).toBe("Land Nord");
    Provinces.renameRegion(1, id, "Ost", "Duchy");
    expect(Provinces.region(1, id)?.fullName).toBe("Duchy of Ost");
    Provinces.setRegion(3, id);
    expect(pack.provinces[3].region).toBe(id);
    expect(() => Provinces.setRegion(3, 99)).toThrow("has no region");
    Provinces.removeRegion(1, id);
    expect(pack.provinces[3].region).toBeUndefined();
  });
});
