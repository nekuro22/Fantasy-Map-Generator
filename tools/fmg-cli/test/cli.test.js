import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { test } from "node:test";
import { MapFile, RECORDS } from "../src/mapfile.js";

const fixture = process.env.FMG_FIXTURE ?? new URL("../../../tests/fixtures/1.154.0.map", import.meta.url).pathname;
const skip = !existsSync(fixture);
const cli = new URL("../src/cli.js", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "fmg-cli-"));
const run = (...args) => {
  const r = spawnSync("node", [cli, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};

test("info and list read the map", { skip }, () => {
  const info = run("info", fixture, "--json").json();
  assert.equal(info.counts.states, 97);
  const top = run("list", fixture, "states", "--sort", "population", "--desc", "--limit", "3", "--json").json();
  assert.equal(top.length, 3);
  assert.ok(top[0].population >= top[1].population && top[1].population >= top[2].population);
  const provinces = run("list", fixture, "provinces", "--where", `state=${top[0].name}`, "--fields", "id,state", "--json").json();
  assert.ok(provinces.length > 0 && provinces.every(p => p.state === top[0].name && Object.keys(p).length === 2));
});

test("get resolves names and explains ambiguity", { skip }, () => {
  const state = run("get", fixture, "state", "Thok", "--json").json();
  assert.equal(state.id, 19);
  assert.ok(state.provinces.length > 0 && state.diplomacy);
  const missing = run("get", fixture, "state", "Nowhere", "--json");
  assert.equal(missing.code, 1);
  assert.match(missing.json().error, /No state "Nowhere"/);
  const usage = run("get", fixture);
  assert.equal(usage.code, 2);
});

test("edits change only their records and keep the file loadable", { skip }, () => {
  const out = join(dir, "edited.map");
  const r = run("set", fixture, "state", "Thok", "formName=People's Republic", "note=Line one\nLine <two>", "-o", out, "--json");
  assert.equal(r.code, 0, r.out + r.err);
  const result = r.json();
  assert.equal(result.written, out);
  assert.ok(result.warnings.some(w => /Socialist/.test(w)));

  const [a, b] = [readFileSync(fixture, "utf8").split("\r\n"), readFileSync(out, "utf8").split("\r\n")];
  assert.equal(a.length, b.length);
  const changed = a.map((line, i) => (line === b[i] ? null : i)).filter(i => i !== null);
  assert.deepEqual(changed, [RECORDS.states]);
  const thok = JSON.parse(b[RECORDS.states])[19];
  assert.equal(thok.form, "Socialist");
  assert.equal(thok.fullName, "People's Republic of Thok");
  assert.equal(thok.note, "<p>Line one</p><p>Line &lt;two&gt;</p>");
  assert.equal(thok.label?.text, undefined);
});

test("relations set both sides, claims and occupation stay consistent", { skip }, () => {
  const out = join(dir, "politics.map");
  const ops = [
    { op: "relation", state: "Thok", other: 4, relation: "vassal" },
    { op: "occupy", province: 196, state: 4 },
    { op: "claim", province: 196, state: 4, claim: "claim" },
    { op: "claim", province: 196, state: 4, claim: "core" },
    { op: "occupy", province: 32, state: "Thok" }
  ];
  const opsFile = join(dir, "ops.json");
  writeFileSync(opsFile, JSON.stringify(ops));
  assert.equal(run("apply", fixture, opsFile, "-o", out).code, 0);
  const file = MapFile.load(out);
  const [states, provinces] = [file.get("states"), file.get("provinces")];
  assert.equal(states[19].diplomacy[4], "Vassal");
  assert.equal(states[4].diplomacy[19], "Suzerain");
  assert.deepEqual(states[0].diplomacy.at(-1), ["Vassalization", "Thok became a vassal of Mach"]);
  assert.equal(provinces[196].controller, 4);
  assert.deepEqual(provinces[196].cores, [4]);
  assert.equal(provinces[196].claims, undefined);
  assert.equal(provinces[32].controller, undefined, "the owner occupying its own province is no occupation");
});

test("a failing batch writes nothing; --in-place keeps a backup; gzip stays gzip", { skip }, () => {
  const out = join(dir, "never.map");
  const bad = spawnSync("node", [cli, "apply", fixture, "-", "-o", out, "--json"], {
    input: JSON.stringify([{ op: "set", type: "state", ref: 19, field: "name", value: "Ok" }, { op: "claim", province: 196, state: 4, claim: "dream" }]),
    encoding: "utf8"
  });
  assert.equal(bad.status, 1);
  assert.match(JSON.parse(bad.stdout).error, /Op 2 \(claim\).*Nothing was written/);
  assert.equal(existsSync(out), false);

  const gz = join(dir, "packed.map");
  writeFileSync(gz, gzipSync(readFileSync(fixture)));
  assert.equal(run("set", gz, "burg", "67", "name=Neu-Grim", "--in-place").code, 0);
  assert.ok(existsSync(`${gz}.bak`));
  const text = gunzipSync(readFileSync(gz)).toString("utf8");
  assert.equal(JSON.parse(text.split("\r\n")[RECORDS.burgs])[67].name, "Neu-Grim");
  assert.equal(run("set", gz, "burg", "67", "name=X").code, 2, "no destination is a usage error");
});

test("diff reports land changing hands and state changes", { skip }, () => {
  const lines = readFileSync(fixture, "utf8").split("\r\n");
  const provinces = JSON.parse(lines[RECORDS.provinces]);
  const cellsState = lines[25].split(",").map(Number);
  const cellsProvince = lines[27].split(",").map(Number);
  const moved = cellsProvince.map((p, c) => (p === 196 ? c : -1)).filter(c => c >= 0);
  for (const c of moved) cellsState[c] = 4;
  provinces[196].state = 4;
  lines[25] = cellsState.join(",");
  lines[RECORDS.provinces] = JSON.stringify(provinces);
  const after = join(dir, "after.map");
  writeFileSync(after, lines.join("\r\n"));

  const d = run("diff", fixture, after, "--json").json();
  assert.equal(d.sameGraph, true);
  assert.deepEqual(d.transfers[0], { ...d.transfers[0], from: "Thok", to: "Mach", cells: moved.length });
  assert.ok(d.provinces.ownerChanged.some(p => p.id === 196 && p.from === "Thok" && p.to === "Mach"));
  assert.ok(d.states.territory.some(s => s.name === "Thok" && s.cells[1] === s.cells[0] - moved.length));
  const text = run("diff", fixture, after).out;
  assert.match(text, /Land changing hands/);
});

test("guide and forms are available", () => {
  assert.match(execFileSync("node", [cli, "guide"], { encoding: "utf8" }), /guide for AI agents/);
  const forms = JSON.parse(execFileSync("node", [cli, "forms", "--json"], { encoding: "utf8" }));
  assert.ok(forms.governments.Socialist.includes("People's Republic"));
});

test("factions and regions: create, join, edit, list and compare", { skip }, () => {
  const out = join(dir, "factions.map");
  const ops = join(dir, "faction-ops.json");
  writeFileSync(
    ops,
    JSON.stringify([
      { op: "relation", state: "Aymar", other: "Lylath", relation: "Neutral" },
      { op: "faction", action: "create", leader: "Aymar", name: "Northern Pact", type: "Pact" },
      { op: "faction", action: "join", faction: "Northern Pact", state: "Lylath" },
      { op: "set", type: "states", ref: "Aymar", field: "lore", value: "Proud herders" },
      { op: "region-add", state: "Aymar", name: "Nordmark", formName: "Duchy" },
      { op: "set", type: "regions", ref: "Aymar/Nordmark", field: "lore", value: "Cold and green" }
    ])
  );
  const r = run("apply", fixture, ops, "-o", out, "--json");
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(r.json().warnings.some(w => /Factions/.test(w)));

  const factions = run("list", out, "factions", "--json").json();
  assert.equal(factions.length, 1);
  assert.deepEqual([factions[0].name, factions[0].leader, factions[0].members], ["Northern Pact", "Aymar", 2]);
  const lylath = run("get", out, "state", "Lylath", "--json").json();
  assert.equal(lylath.faction, "Northern Pact");
  assert.equal(lylath.diplomacy.Aymar, "Ally");
  const aymar = run("get", out, "state", "Aymar", "--json").json();
  assert.equal(aymar.lore, "Proud herders");
  assert.equal(aymar.regions[0].name, "Duchy of Nordmark");
  const regions = run("list", out, "regions", "--json").json();
  assert.deepEqual([regions[0].state, regions[0].fullName, regions[0].lore], ["Aymar", "Duchy of Nordmark", "yes"]);

  // the file keeps its other records and still loads
  const [a, b] = [readFileSync(fixture, "utf8").split("\r\n"), readFileSync(out, "utf8").split("\r\n")];
  assert.ok(b.length > RECORDS.factions);
  assert.equal(JSON.parse(b[RECORDS.factions])[0].leader, aymar.id);
  assert.equal(a[RECORDS.biomes], b[RECORDS.biomes]);

  // rules: one faction per state, no joining a member's enemy, a leader must be a member
  const dup = run("faction", out, "join", "Northern Pact", "Lylath", "--dry-run", "--json");
  assert.match(dup.json().error, /already in Northern Pact/);
  const lead = run("faction", out, "leader", "Northern Pact", "Thok", "--dry-run", "--json");
  assert.match(lead.json().error, /must be a member/);

  // leaving hands the lead on; an empty faction ends
  const left = join(dir, "left.map");
  assert.equal(run("faction", out, "leave", "Aymar", "-o", left).code, 0);
  assert.equal(run("list", left, "factions", "--json").json()[0].leader, "Lylath");
  const gone = join(dir, "gone.map");
  assert.equal(run("faction", left, "leave", "Lylath", "-o", gone).code, 0);
  assert.equal(run("list", gone, "factions", "--json").json().length, 0);

  // region assignment and the comparison of two versions
  const province = run("list", fixture, "provinces", "--where", "state=Aymar", "--limit", "1", "--json").json()[0];
  const assigned = join(dir, "assigned.map");
  assert.equal(run("region", out, "assign", String(province.id), "Aymar/Nordmark", "-o", assigned).code, 0);
  assert.equal(run("list", assigned, "regions", "--json").json()[0].provinces, 1);
  const diff = run("diff", fixture, out, "--json").json();
  assert.ok(diff.factions.some(f => f.change === "founded" && f.faction === "Northern Pact"));
  const leftDiff = run("diff", out, left, "--json").json();
  assert.ok(leftDiff.factions.some(f => f.change === "left" && f.state === "Aymar"));
});
