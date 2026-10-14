// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(async () => {
  await import("./states-generator");
  await import("./provinces-generator");
  await import("./factions-generator");
});

const state = (i: number, name: string, area: number, extra = {}) => ({
  i,
  name,
  area,
  form: "Republic",
  color: "#aa0000",
  diplomacy: ["x", "Neutral", "Neutral", "Neutral", "Neutral"],
  ...extra
});

beforeEach(() => {
  vi.stubGlobal("options", { map: { lore: { calendar: { year: 1936 } } } });
  vi.stubGlobal("pack", {
    states: [
      { i: 0, diplomacy: [] },
      state(1, "Alia", 50),
      state(2, "Borea", 30),
      state(3, "Cora", 80),
      state(4, "Dura", 10)
    ],
    provinces: [{ i: 0 }],
    burgs: [0],
    cells: { state: [], province: [] }
  });
  vi.spyOn(States, "getChronicle").mockReturnValue([]);
});

describe("Factions", () => {
  it("founds a faction with its leader, dated by the calendar", () => {
    const id = Factions.create("Northern Pact", 1, "Pact");
    expect(Factions.get(id)).toMatchObject({ name: "Northern Pact", leader: 1, members: [1], founded: 1936 });
    expect(() => Factions.create("Again", 1)).toThrow("already in");
  });

  it("makes members allies, and refuses a state at war with a member", () => {
    const id = Factions.create("Pact", 1);
    Factions.join(id, 2);
    expect(pack.states[1].diplomacy?.[2]).toBe("Ally");
    expect(pack.states[2].diplomacy?.[1]).toBe("Ally");
    States.setRelation(3, 1, "Enemy");
    expect(() => Factions.join(id, 3)).toThrow("at war with");
    expect(() => Factions.join(Factions.create("Other", 4), 2)).toThrow("already in Pact");
  });

  it("hands the lead on when the leader leaves, and ends an empty faction", () => {
    const id = Factions.create("Pact", 1);
    Factions.join(id, 2);
    Factions.leave(1);
    expect(Factions.get(id).leader).toBe(2);
    expect(pack.states[1].diplomacy?.[2]).toBe("Friendly");
    Factions.leave(2);
    expect(Factions.all()).toHaveLength(0);
    expect(() => Factions.leave(2)).toThrow("in no faction");
  });

  it("calls the members to the wars of the leader", () => {
    const id = Factions.create("Pact", 1);
    Factions.join(id, 2);
    States.setRelation(1, 3, "Enemy");
    expect(Factions.callToArms(id)).toBe(1);
    expect(pack.states[2].diplomacy?.[3]).toBe("Enemy");
    expect(Factions.callToArms(id)).toBe(0);
  });

  it("makes factions from alliances, led by the biggest, plus a socialist bloc", () => {
    States.setRelation(1, 3, "Ally");
    pack.states[2].form = "Socialist";
    pack.states[4].form = "Socialist";
    expect(Factions.generate()).toBe(2);
    const [alliance, bloc] = Factions.all();
    expect(alliance.leader).toBe(3);
    expect(alliance.members.sort()).toEqual([1, 3]);
    expect(bloc.type).toBe("Bloc");
    expect(bloc.members.sort()).toEqual([2, 4]);
  });

  it("drops members that are gone", () => {
    const id = Factions.create("Pact", 1);
    Factions.join(id, 2);
    pack.states[1].removed = true;
    Factions.tidy();
    expect(Factions.get(id)).toMatchObject({ leader: 2, members: [2] });
  });

  it("checks the color and the leader", () => {
    const id = Factions.create("Pact", 1);
    expect(() => Factions.recolor(id, "red")).toThrow("hex");
    expect(() => Factions.setLeader(id, 2)).toThrow("member");
  });
});
