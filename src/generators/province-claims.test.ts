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
