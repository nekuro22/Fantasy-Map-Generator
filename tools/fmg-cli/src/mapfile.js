// Raw access to a .map file: its CRLF records, parsed lazily and written back untouched unless edited
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

/** Record (line) index of each entity list in the .map format */
export const RECORDS = {
  biomes: 3,
  features: 12,
  cultures: 13,
  states: 14,
  burgs: 15,
  religions: 29,
  provinces: 30,
  rivers: 32,
  markers: 35,
  routes: 37,
  zones: 38,
  factions: 53 // the fork's factions; absent in other maps
};

export function decode(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return { text: (gzipped ? gunzipSync(bytes) : bytes).toString("utf8"), gzipped };
}

export class MapFile {
  constructor(buffer, path = "") {
    const { text, gzipped } = decode(buffer);
    if (text.trimStart().startsWith("{"))
      throw new Error(`${path || "File"} is a JSON export: edits need the .map file (File → Save in the generator)`);
    this.path = path;
    this.gzipped = gzipped;
    this.lines = text.split("\r\n");
    if (!/^\d+\.\d+/.test(this.lines[0]) || this.lines.length < 32) throw new Error("Not a Fantasy Map Generator .map file");
    this.version = this.lines[0].split("|")[0];
    this.parsed = {};
    this.dirty = new Set();
  }

  static load(path) {
    return new MapFile(readFileSync(path), path);
  }

  /** The parsed entity list; mutate it and call touch() */
  get(kind) {
    if (!(kind in RECORDS)) throw new Error(`Unknown record ${kind}`);
    if (!this.parsed[kind]) {
      const line = this.lines[RECORDS[kind]];
      if (kind === "biomes" && line && !line.startsWith("["))
        throw new Error("Biomes of maps older than 1.139 cannot be edited; re-save the map in the generator");
      this.parsed[kind] = line ? JSON.parse(line) : [];
    }
    return this.parsed[kind];
  }

  /** All entity lists, as the query helpers expect them */
  get data() {
    const data = {};
    for (const kind of Object.keys(RECORDS)) Object.defineProperty(data, kind, { get: () => this.get(kind), enumerable: true });
    return data;
  }

  touch(kind) {
    this.dirty.add(kind);
  }

  toBuffer() {
    const lines = [...this.lines];
    for (const kind of this.dirty) {
      while (lines.length <= RECORDS[kind]) lines.push("");
      lines[RECORDS[kind]] = JSON.stringify(this.parsed[kind]);
    }
    const text = Buffer.from(lines.join("\r\n"), "utf8");
    return this.gzipped ? gzipSync(text) : text;
  }

  /** Write atomically; with a backup of the file being replaced */
  save(path, { backup = false } = {}) {
    const buffer = this.toBuffer();
    if (backup) writeFileSync(`${path}.bak`, readFileSync(path));
    const temp = `${path}.tmp-${process.pid}`;
    writeFileSync(temp, buffer);
    renameSync(temp, path);
    return buffer;
  }
}
