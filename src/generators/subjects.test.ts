import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SUBJECT_TYPES } from "@/data/subjects";

beforeAll(async () => {
  await import("./states-generator");
});

const world = (overlordForm: string, overlordFormName: string) => ({
  states: [
    { i: 0, diplomacy: [] },
    { i: 1, name: "Rhun", form: overlordForm, formName: overlordFormName, diplomacy: ["x", "x", "Suzerain"] },
    { i: 2, name: "Vel", form: "Monarchy", formName: "Kingdom", diplomacy: ["x", "Vassal", "x"] }
  ]
});

describe("subject types", () => {
  beforeEach(() => vi.stubGlobal("options", { map: { seed: "subjects" } }));

  it("makes vassals the kind of subject their overlord's government makes", () => {
    vi.stubGlobal("pack", world("Socialist", "Soviet Union"));
    States.assignSubjects();
    const vassal = pack.states[2];
    expect(SUBJECT_TYPES[vassal.subject!].weights.Socialist).toBeGreaterThan(0);
    expect(States.getOverlord(2)).toBe(1);
    expect(pack.states[1].subject).toBeUndefined();
  });

  it("renames a subject to fit its kind and checks the input", () => {
    vi.stubGlobal("pack", world("Monarchy", "Empire"));
    States.setSubjectType(2, "Dominion", true, () => 0);
    expect(pack.states[2]).toMatchObject({ subject: "Dominion", formName: "Dominion", fullName: "Dominion of Vel" });
    States.setSubjectType(2, "Satellite", true, () => 0);
    expect(pack.states[2]).toMatchObject({ form: "Socialist", formName: "People's Republic" });
    expect(() => States.setSubjectType(2, "Friend", true)).toThrow("The subject type must be one of");
    expect(() => States.setSubjectType(1, "Puppet")).toThrow("is not a vassal");
  });
});
