#!/usr/bin/env node
// fmg — read, edit, compare and convert Fantasy Map Generator maps from the command line
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { parseArgs } from "node:util";
import { toCsv } from "./csv.js";
import { diffWorlds } from "./diff.js";
import { CLAIM_KINDS, Editor, FACTION_ACTIONS, FACTION_TYPES, FIELDS, RELATIONS, STATE_FORMS } from "./edit.js";
import { guide } from "./guide.js";
import { buildLayers, DEFAULT_LAYERS, LAYERS } from "./layers.js";
import { parseWorld } from "./load.js";
import { MapFile } from "./mapfile.js";
import { call, connection, pullFile, pushFile } from "./remote.js";
import { startServer } from "./server.js";
import { createToken, ensureToken, tokenPath } from "./token.js";
import { details, entities, filterRows, Index, KINDS, kindOf, mapInfo, resolve, search, summary } from "./query.js";

const HELP = `fmg — Fantasy Map Generator maps on the command line (.map files and "Full" JSON exports)

Read
  fmg info <map>                                  map summary and entity counts
  fmg list <map> <type> [--where k=v] [--sort population --desc] [--limit 20] [--fields a,b]
  fmg get <map> <type> <id|name> [--raw]          one entity with related data
  fmg search <map> <text> [--type states]         find anything by name or note
  fmg diff <old map> <new map> [--limit 40]       what changed between two versions

Edit (.map only; choose -o <new.map> or --in-place, which keeps <map>.bak; --dry-run to preview)
  fmg set <map> <type> <id|name> field=value [field=value …]
  fmg relation <map> <state> <other state> <relation>
  fmg claim <map> <province> <state> core|claim|none
  fmg occupy <map> <province> <state|none>
  fmg owner-cores <map>                           every state gets a core on the provinces it owns
  fmg faction <map> create <state> [name] [--type Pact]   found a faction led by a state
  fmg faction <map> join <faction> <state> | leave <state> | leader <faction> <state> | dissolve <faction> | arms <faction>
  fmg region <map> add <state> <name> [form] | remove <State/Region> | assign <province> <State/Region|none>
  fmg apply <map> <ops.json|->                    several edits at once, all or nothing

Convert
  fmg convert <map> [-o dir] [-l layers] [--crs geo|pixel] [--single] [--csv]

Server (run maps on another machine, e.g. a Raspberry Pi; every request needs the API token)
  fmg serve [--dir ~/fmg-maps] [--port 5174] [--host 0.0.0.0]   start the API
  fmg token [--new]                               show the token (--new replaces it; restart the server)
  fmg remote maps | push <file.map> [name] | pull <name> [file] | info|list|get|search|diff|apply …   same as locally
  Connect with FMG_URL=http://<address>:5174 and FMG_TOKEN=<token> (or --url / --token)

Other
  fmg guide                                       instructions for AI agents
  fmg forms                                       governments, form names, relations, editable fields

Types: ${KINDS.join(", ")}
Add --json to any command for machine-readable output.`;

const OPTIONS = {
  json: { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
  where: { type: "string", short: "w", multiple: true },
  sort: { type: "string", short: "s" },
  desc: { type: "boolean", default: false },
  limit: { type: "string", short: "n" },
  fields: { type: "string", short: "f" },
  type: { type: "string", short: "t" },
  raw: { type: "boolean", default: false },
  out: { type: "string", short: "o" },
  "in-place": { type: "boolean", default: false },
  "dry-run": { type: "boolean", default: false },
  layers: { type: "string", short: "l" },
  crs: { type: "string", default: "geo" },
  single: { type: "boolean", default: false },
  csv: { type: "boolean", default: false },
  dir: { type: "string" },
  port: { type: "string" },
  host: { type: "string" },
  new: { type: "boolean", default: false },
  url: { type: "string" },
  token: { type: "string" }
};

class UsageError extends Error {}

async function main(argv) {
  const { values: opts, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true });
  const [command, ...args] = positionals;
  if (!command || opts.help || command === "help") return print(opts, HELP);

  const need = (n, usage) => {
    if (args.length < n) throw new UsageError(`Usage: fmg ${usage}`);
  };
  const load = path => parseWorld(readFileSync(path));

  switch (command) {
    case "info": {
      need(1, "info <map>");
      const world = load(args[0]);
      return output(opts, mapInfo(world, new Index(world)));
    }
    case "list": {
      need(2, "list <map> <type>");
      const world = load(args[0]);
      const kind = kindOf(args[1]);
      const index = new Index(world);
      const rows = entities(world, kind).map(e => summary(world, index, kind, e));
      const filtered = filterRows(rows, {
        where: opts.where ?? [],
        sort: opts.sort && opts.desc ? `-${opts.sort}` : opts.sort,
        limit: opts.limit ? +opts.limit : undefined,
        fields: opts.fields?.split(",").map(s => s.trim())
      });
      return opts.json ? output(opts, filtered) : print(opts, table(filtered, rows.length));
    }
    case "get": {
      need(3, "get <map> <type> <id|name>");
      const world = load(args[0]);
      const kind = kindOf(args[1]);
      const e = resolve(world, kind, args.slice(2).join(" "));
      return output(opts, details(world, new Index(world), kind, e, { raw: opts.raw }));
    }
    case "search": {
      need(2, "search <map> <text>");
      const world = load(args[0]);
      const hits = search(world, args.slice(1).join(" "), opts.type ? [kindOf(opts.type)] : KINDS);
      return opts.json ? output(opts, hits) : print(opts, hits.length ? table(hits) : "No matches");
    }
    case "diff": {
      need(2, "diff <old map> <new map>");
      const result = diffWorlds(load(args[0]), load(args[1]), { limit: opts.limit ? +opts.limit : 40 });
      return opts.json ? output(opts, result) : print(opts, diffText(result));
    }
    case "set": {
      need(4, "set <map> <type> <id|name> field=value …");
      const assignments = [];
      const refParts = [];
      for (const arg of args.slice(2)) {
        const m = arg.match(/^([A-Za-z]+)=(.*)$/s);
        if (m && refParts.length) assignments.push([m[1], m[2]]);
        else if (!assignments.length) refParts.push(arg);
        else throw new UsageError(`Expected field=value, got "${arg}"`);
      }
      if (!assignments.length) throw new UsageError("Name at least one field=value");
      const ops = assignments.map(([field, value]) => ({ op: "set", type: args[1], ref: refParts.join(" "), field, value }));
      return edit(opts, args[0], ops);
    }
    case "relation":
      need(4, "relation <map> <state> <other state> <relation>");
      return edit(opts, args[0], [{ op: "relation", state: args[1], other: args[2], relation: args[3] }]);
    case "claim":
      need(4, "claim <map> <province> <state> core|claim|none");
      return edit(opts, args[0], [{ op: "claim", province: args[1], state: args[2], claim: args[3] }]);
    case "occupy":
      need(3, "occupy <map> <province> <state|none>");
      return edit(opts, args[0], [{ op: "occupy", province: args[1], state: args[2] }]);
    case "owner-cores":
      need(1, "owner-cores <map>");
      return edit(opts, args[0], [{ op: "owner-cores" }]);
    case "faction": {
      need(3, "faction <map> create|join|leave|leader|dissolve|arms …");
      const [, action, ...rest] = args;
      const op = { op: "faction", action };
      if (action === "create") Object.assign(op, { leader: rest[0], name: rest[1], type: opts.type });
      else if (action === "join" || action === "leader") Object.assign(op, { faction: rest[0], state: rest[1] });
      else if (action === "leave") Object.assign(op, { state: rest[0] });
      else if (action === "dissolve" || action === "arms") Object.assign(op, { faction: rest[0] });
      else throw new UsageError(`Faction actions: ${FACTION_ACTIONS.join(", ")}`);
      if (rest[0] === undefined) throw new UsageError(`Usage: fmg faction <map> ${action} <${action === "leave" ? "state" : action === "create" ? "state" : "faction"}> …`);
      if ((action === "join" || action === "leader") && rest[1] === undefined) throw new UsageError(`Usage: fmg faction <map> ${action} <faction> <state>`);
      return edit(opts, args[0], [op]);
    }
    case "region": {
      need(3, "region <map> add|remove|assign …");
      const [, action, ...rest] = args;
      if (action === "add") {
        if (rest.length < 2) throw new UsageError("Usage: fmg region <map> add <state> <name> [form]");
        return edit(opts, args[0], [{ op: "region-add", state: rest[0], name: rest[1], formName: rest[2] }]);
      }
      if (action === "remove") return edit(opts, args[0], [{ op: "region-remove", region: rest[0] }]);
      if (action === "assign") {
        if (rest.length < 2) throw new UsageError("Usage: fmg region <map> assign <province> <State/Region|none>");
        return edit(opts, args[0], [{ op: "assign-region", province: rest[0], region: rest[1] }]);
      }
      throw new UsageError("Region actions: add, remove, assign");
    }
    case "apply": {
      need(2, "apply <map> <ops.json|->");
      const text = args[1] === "-" ? readFileSync(0, "utf8") : readFileSync(args[1], "utf8");
      const ops = JSON.parse(text);
      if (!Array.isArray(ops)) throw new UsageError("ops must be a JSON array like [{\"op\":\"set\",\"type\":\"states\",\"ref\":\"Aurelia\",\"field\":\"name\",\"value\":\"…\"}]");
      return edit(opts, args[0], ops);
    }
    case "serve": {
      const dir = opts.dir || process.env.FMG_MAPS || join(process.env.HOME ?? ".", "fmg-maps");
      const port = +(opts.port || process.env.FMG_PORT || 5174);
      await startServer({ dir, port, host: opts.host || "0.0.0.0", log: line => console.log(`${new Date().toISOString()} ${line}`) });
      console.log(`fmg API on port ${port}, maps in ${dir}. Token: fmg token (file ${tokenPath()})`);
      return new Promise(() => {});
    }
    case "token": {
      if (opts.new) {
        createToken();
        process.stderr.write("New token made. Restart the server (the old token stops working then)\n");
      }
      return print(opts, opts.json ? JSON.stringify({ token: ensureToken(), file: tokenPath() }) : ensureToken());
    }
    case "remote":
      return remote(opts, args);
    case "convert":
      need(1, "convert <map>");
      return convert(opts, args[0]);
    case "forms":
      return output(opts, { governments: STATE_FORMS, relations: RELATIONS, claims: CLAIM_KINDS, factionTypes: FACTION_TYPES, factionActions: FACTION_ACTIONS, editableFields: FIELDS });
    case "guide":
      return print(opts, guide());
    default:
      throw new UsageError(`Unknown command "${command}". Run fmg --help`);
  }
}

async function remote(opts, args) {
  const [sub, ...rest] = args;
  const conn = connection(opts);
  const name = n => encodeURIComponent(n);
  const usage = text => {
    throw new UsageError(`Usage: fmg remote ${text}`);
  };
  switch (sub) {
    case "maps":
      return output(opts, await call(conn, "GET", "/maps"));
    case "push":
      if (rest.length < 1) usage("push <file.map> [name]");
      return output(opts, await pushFile(conn, rest[0], rest[1]));
    case "pull":
      if (rest.length < 1) usage("pull <name> [file]");
      return output(opts, await pullFile(conn, rest[0], rest[1]));
    case "info":
      if (rest.length < 1) usage("info <name>");
      return output(opts, await call(conn, "GET", `/maps/${name(rest[0])}/info`));
    case "list":
      if (rest.length < 2) usage("list <name> <type> [--where k=v] [--sort f --desc] [--limit n] [--fields a,b]");
      return output(opts, await call(conn, "GET", `/maps/${name(rest[0])}/list`, { query: { type: rest[1], where: opts.where, sort: opts.sort, desc: opts.desc ? "1" : undefined, limit: opts.limit, fields: opts.fields } }));
    case "get":
      if (rest.length < 3) usage("get <name> <type> <id|name> [--raw]");
      return output(opts, await call(conn, "GET", `/maps/${name(rest[0])}/get`, { query: { type: rest[1], ref: rest[2], raw: opts.raw ? "1" : undefined } }));
    case "search":
      if (rest.length < 2) usage("search <name> <text> [--type states]");
      return output(opts, await call(conn, "GET", `/maps/${name(rest[0])}/search`, { query: { q: rest[1], type: opts.type } }));
    case "diff":
      if (rest.length < 2) usage("diff <old name> <new name>");
      return output(opts, await call(conn, "GET", "/diff", { query: { old: rest[0], new: rest[1], limit: opts.limit } }));
    case "apply": {
      if (rest.length < 2) usage("apply <name> <ops.json|-> [--dry-run]");
      const ops = JSON.parse(rest[1] === "-" ? readFileSync(0, "utf8") : readFileSync(rest[1], "utf8"));
      if (!Array.isArray(ops)) throw new UsageError("ops must be a JSON array");
      return output(opts, await call(conn, "POST", `/maps/${name(rest[0])}/ops`, { body: { ops, dryRun: opts["dry-run"] } }));
    }
    default:
      return usage("maps | push | pull | info | list | get | search | diff | apply");
  }
}

function edit(opts, path, ops) {
  if (!opts["dry-run"] && !opts.out && !opts["in-place"])
    throw new UsageError("Choose where to write: -o <new.map>, --in-place (keeps a .bak), or --dry-run to preview");
  const file = MapFile.load(path);
  const editor = new Editor(file);
  ops.forEach((op, i) => {
    try {
      editor.apply(op);
    } catch (error) {
      throw new Error(`${ops.length > 1 ? `Op ${i + 1} (${op.op}): ` : ""}${error.message.replace(/\.$/, "")}. Nothing was written`);
    }
  });

  const result = { changes: editor.changes, warnings: editor.warnings };
  if (!editor.changes.length) result.written = null;
  else if (opts["dry-run"]) result.written = null;
  else {
    const target = opts.out ?? path;
    const check = parseWorld(file.toBuffer()); // refuse to write a map that no longer loads
    file.save(target, { backup: !opts.out });
    result.written = target;
    if (!opts.out) result.backup = `${path}.bak`;
    result.verified = `${check.cells.v.length} cells, ${entities(check, "states").length} states`;
  }
  if (opts.json) return output(opts, result);

  const lines = [];
  if (!result.changes.length) lines.push("No changes: everything already had these values");
  for (const c of result.changes) lines.push(`${c.type} ${c.id} ${c.name}: ${c.field}: ${show(c.from)} → ${show(c.to)}`);
  for (const w of result.warnings) lines.push(`Note: ${w}`);
  if (opts["dry-run"] && result.changes.length) lines.push("Dry run: nothing written");
  if (result.written) lines.push(`Wrote ${result.written}${result.backup ? ` (backup ${result.backup})` : ""}; reloads fine: ${result.verified}`);
  return print(opts, lines.join("\n"));
}

function convert(opts, input) {
  if (!["geo", "pixel"].includes(opts.crs)) throw new UsageError('--crs must be "geo" or "pixel"');
  const layers = opts.layers ? opts.layers.split(",").map(s => s.trim()).filter(Boolean) : DEFAULT_LAYERS;
  for (const layer of layers) if (!LAYERS.includes(layer)) throw new UsageError(`Unknown layer "${layer}". Layers: ${LAYERS.join(", ")}`);
  const world = parseWorld(readFileSync(input));
  const collections = buildLayers(world, { layers, crs: opts.crs });
  const stem = basename(input, extname(input));
  const out = opts.out ?? `${stem}_geojson`;
  mkdirSync(out, { recursive: true });
  const files = [];
  if (opts.single) {
    const features = Object.entries(collections).flatMap(([layer, fc]) =>
      fc.features.map(f => ({ ...f, id: `${layer}-${f.id}`, properties: { layer, ...f.properties } }))
    );
    const file = join(out, `${stem}.geojson`);
    writeFileSync(file, JSON.stringify({ type: "FeatureCollection", name: stem, features }));
    files.push({ file, features: features.length });
  } else
    for (const [layer, fc] of Object.entries(collections)) {
      const file = join(out, `${layer}.geojson`);
      writeFileSync(file, JSON.stringify(fc));
      files.push({ file, features: fc.features.length });
    }
  if (opts.csv) for (const [layer, fc] of Object.entries(collections)) writeFileSync(join(out, `${layer}.csv`), toCsv(fc));
  const result = { map: world.name || stem, version: world.version, cells: world.cells.v.length, crs: opts.crs, files };
  if (opts.json) return output(opts, result);
  return print(
    opts,
    [`${result.map} — FMG ${result.version ?? "?"}, ${result.cells} cells, crs ${opts.crs}`, ...files.map(f => `  ${f.file} (${f.features})`)].join("\n")
  );
}

// ---------- text output ----------

const show = v => (v === undefined ? "(none)" : typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v));
const fmt = v => (typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString("en-US") : String(v)) : v === true ? "yes" : v === false ? "" : (v ?? ""));

function table(rows, total = rows.length) {
  if (!rows.length) return "No rows";
  const columns = [...new Set(rows.flatMap(r => Object.keys(r)))].filter(c => c !== "color");
  const cell = (r, c) => {
    const text = String(fmt(r[c]));
    return text.length > 32 ? `${text.slice(0, 31)}…` : text;
  };
  const widths = columns.map(c => Math.max(c.length, ...rows.map(r => cell(r, c).length)));
  const line = values => values.map((v, i) => v.padEnd(widths[i])).join("  ").trimEnd();
  const out = [line(columns), line(widths.map(w => "-".repeat(w))), ...rows.map(r => line(columns.map(c => cell(r, c))))];
  if (total > rows.length) out.push(`(${rows.length} of ${total} shown)`);
  return out.join("\n");
}

function yaml(value, indent = "") {
  if (Array.isArray(value)) {
    if (!value.length) return " []";
    if (value.every(v => typeof v !== "object" || v === null)) return ` ${value.map(fmt).join(", ")}`;
    return value
      .map(v => {
        if (typeof v !== "object" || v === null) return `\n${indent}- ${fmt(v)}`;
        const flat = Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : fmt(x)}`);
        return `\n${indent}- ${flat.join(", ")}`;
      })
      .join("");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return " {}";
    return entries.map(([k, v]) => `\n${indent}${k}:${typeof v === "object" && v !== null ? yaml(v, `${indent}  `) : ` ${fmt(v)}`}`).join("");
  }
  return ` ${fmt(value)}`;
}

function diffText(d) {
  const out = [];
  const s = d.summary;
  out.push(
    `States: +${s.statesAdded} −${s.statesRemoved}, ${s.statesChanged} changed, ${s.statesWithTerritoryChange} with changed land or population; ` +
      `${s.provincesChangedOwner} provinces and ${s.burgsChangedState} burgs changed hands; ${s.relationsChanged} relations changed`
  );
  for (const note of d.notes) out.push(`Note: ${note}`);
  const section = (title, group, key) => {
    const rows = group?.[key];
    if (!rows?.length) return;
    const cells = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? `${fmt(v[0]) || "–"} → ${fmt(v[1]) || "–"}` : v])));
    out.push("", `## ${title}`, table(cells, group[`${key}Total`] ?? rows.length));
  };
  section("New states", d.states, "added");
  section("Gone states", d.states, "removed");
  section("Changed states", d.states, "changed");
  section("Land and population (largest change first)", d.states, "territory");
  section("Land changing hands", d, "transfers");
  section("Provinces with a new owner", d.provinces, "ownerChanged");
  section("Occupation changes", d.provinces, "occupationChanged");
  section("Claim changes", d.provinces, "claimsChanged");
  section("New provinces", d.provinces, "added");
  section("Gone provinces", d.provinces, "removed");
  section("Renamed provinces", d.provinces, "renamed");
  section("Burgs changing state", d.burgs, "stateChanged");
  section("Renamed burgs", d.burgs, "renamed");
  section("New burgs", d.burgs, "added");
  section("Gone burgs", d.burgs, "removed");
  section("Diplomacy", d, "diplomacy");
  section("Factions", d, "factions");
  if (d.chronicle?.length) out.push("", "## New chronicle entries", ...d.chronicle.map(e => `- ${e}`));
  return out.join("\n");
}

function output(opts, value) {
  return print(opts, opts.json ? JSON.stringify(value, null, 2) : yaml(value).replace(/^\n/, ""));
}

function print(_opts, text) {
  process.stdout.write(`${text}\n`);
}

const argv = process.argv.slice(2);
if (basename(process.argv[1] ?? "").startsWith("fmg-convert") && argv[0] !== "convert") argv.unshift("convert");
const wantsJson = argv.includes("--json");
main(argv).catch(error => {
  const usage = error instanceof UsageError || error.code?.startsWith?.("ERR_PARSE_ARGS");
  const message = error.code === "ENOENT" ? `File not found: ${error.path}` : error.message;
  if (wantsJson) process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  else process.stderr.write(`Error: ${message}\n`);
  process.exit(usage ? 2 : 1);
});
