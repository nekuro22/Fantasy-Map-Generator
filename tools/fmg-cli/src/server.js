// An HTTP API over the same functions the command line uses, for a server that keeps your maps (a Raspberry Pi, say).
// Every request needs the token as "Authorization: Bearer <token>". Maps live as .map files in one folder.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { diffWorlds } from "./diff.js";
import { Editor } from "./edit.js";
import { parseWorld } from "./load.js";
import { MapFile } from "./mapfile.js";
import { details, entities, filterRows, Index, KINDS, kindOf, mapInfo, resolve, search, summary } from "./query.js";
import { ensureToken, sameToken } from "./token.js";

const MAX_UPLOAD = 200 * 1024 * 1024;
const NAME = /^[\w][\w .()-]{0,120}\.map$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const bad = message => new HttpError(400, message);

/** Starts the API; resolves with the running server */
export function startServer({ dir, port = 5174, host = "0.0.0.0", token = ensureToken(), log = () => {} }) {
  mkdirSync(dir, { recursive: true });
  const cache = new Map(); // name -> { mtime, world }
  const failures = new Map(); // ip -> { count, since }

  const pathOf = name => {
    if (!NAME.test(name ?? "")) throw bad("Map names look like Aurelia.map: letters, digits, space, dot, dash, parentheses");
    return join(dir, name);
  };
  const need = name => {
    const path = pathOf(name);
    if (!existsSync(path)) throw new HttpError(404, `No map "${name}". GET /api/maps lists the maps`);
    return path;
  };
  const world = name => {
    const path = need(name);
    const mtime = statSync(path).mtimeMs;
    const hit = cache.get(name);
    if (hit?.mtime === mtime) return hit.world;
    const parsed = parseWorld(readFileSync(path));
    cache.set(name, { mtime, world: parsed });
    return parsed;
  };

  const handle = async (req, url, body) => {
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "api") throw new HttpError(404, "The API lives under /api");
    const q = url.searchParams;
    const route = parts.slice(1);

    if (route[0] === "health") return { ok: true };
    if (route[0] === "diff" && req.method === "GET") {
      const [a, b] = [q.get("old"), q.get("new")];
      if (!a || !b) throw bad("Use /api/diff?old=<map>&new=<map>");
      return diffWorlds(world(a), world(b), { limit: +(q.get("limit") ?? 40) });
    }
    if (route[0] !== "maps") throw new HttpError(404, "Unknown route. See /api/maps");

    if (route.length === 1) {
      if (req.method !== "GET") throw new HttpError(405, "GET only");
      return readdirSync(dir)
        .filter(f => NAME.test(f))
        .map(f => ({ name: f, size: statSync(join(dir, f)).size, modified: statSync(join(dir, f)).mtime.toISOString() }));
    }
    const name = route[1];
    const action = route[2];

    if (!action) {
      if (req.method === "GET") return { raw: readFileSync(need(name)) };
      if (req.method === "PUT") {
        const path = pathOf(name);
        if (!body?.length) throw bad("The body is empty: send the .map file");
        try {
          parseWorld(body); // refuse anything that is not a loadable map
        } catch (error) {
          throw bad(`Not a loadable map: ${error.message}`);
        }
        if (existsSync(path)) renameSync(path, `${path}.bak`);
        writeFileSync(path, body);
        cache.delete(name);
        return { stored: name, bytes: body.length, backup: existsSync(`${path}.bak`) ? `${name}.bak` : undefined };
      }
      throw new HttpError(405, "GET downloads, PUT uploads");
    }
    if (action === "info") return mapInfo(world(name), new Index(world(name)));
    if (action === "list") {
      const w = world(name);
      const kind = kindOf(q.get("type"));
      const index = new Index(w);
      const rows = entities(w, kind).map(e => summary(w, index, kind, e));
      return filterRows(rows, {
        where: q.getAll("where"),
        sort: q.get("sort") && q.get("desc") === "1" ? `-${q.get("sort")}` : (q.get("sort") ?? undefined),
        limit: q.get("limit") ? +q.get("limit") : undefined,
        fields: q.get("fields")?.split(",").map(s => s.trim())
      });
    }
    if (action === "get") {
      const w = world(name);
      const kind = kindOf(q.get("type"));
      return details(w, new Index(w), kind, resolve(w, kind, q.get("ref") ?? ""), { raw: q.get("raw") === "1" });
    }
    if (action === "search") {
      if (!q.get("q")) throw bad("Use ?q=<text>");
      return search(world(name), q.get("q"), q.get("type") ? [kindOf(q.get("type"))] : KINDS);
    }
    if (action === "ops") {
      if (req.method !== "POST") throw new HttpError(405, "POST a JSON body: {\"ops\": [...], \"dryRun\": false}");
      let input;
      try {
        input = JSON.parse(body.toString("utf8"));
      } catch {
        throw bad("The body must be JSON: {\"ops\": [...]}");
      }
      if (!Array.isArray(input?.ops) || !input.ops.length) throw bad("ops must be a non-empty array, as for `fmg apply`");
      const path = need(name);
      const file = MapFile.load(path);
      const editor = new Editor(file);
      input.ops.forEach((op, i) => {
        try {
          editor.apply(op);
        } catch (error) {
          throw bad(`Op ${i + 1} (${op?.op}): ${error.message.replace(/\.$/, "")}. Nothing was written`);
        }
      });
      const result = { changes: editor.changes, warnings: editor.warnings, written: null };
      if (editor.changes.length && !input.dryRun) {
        const buffer = file.toBuffer();
        parseWorld(buffer); // a map that would not load again is never written
        file.save(path, { backup: true });
        cache.delete(name);
        result.written = name;
        result.backup = `${name}.bak`;
      }
      return result;
    }
    throw new HttpError(404, "Unknown action. Use info, list, get, search or ops");
  };

  const server = createServer((req, res) => {
    const ip = req.socket.remoteAddress ?? "?";
    const send = (status, payload, headers = {}) => {
      res.writeHead(status, { "cache-control": "no-store", ...headers });
      res.end(payload);
    };
    const sendJson = (status, value) => send(status, JSON.stringify(value), { "content-type": "application/json" });
    const recent = failures.get(ip);
    if (recent && Date.now() - recent.since < 60_000 && recent.count >= 10) return sendJson(429, { error: "Too many wrong tokens; wait a minute" });

    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!sameToken(given, token)) {
      const entry = recent && Date.now() - recent.since < 60_000 ? recent : { count: 0, since: Date.now() };
      entry.count++;
      failures.set(ip, entry);
      return sendJson(401, { error: "Missing or wrong token: send  Authorization: Bearer <token>" });
    }
    failures.delete(ip);

    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_UPLOAD) {
        sendJson(413, { error: "Upload too large" });
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", async () => {
      if (res.writableEnded) return;
      try {
        const url = new URL(req.url, "http://localhost");
        const result = await handle(req, url, Buffer.concat(chunks));
        log(`${req.method} ${url.pathname}`);
        if (result?.raw) send(200, result.raw, { "content-type": "application/octet-stream" });
        else sendJson(200, result);
      } catch (error) {
        const status = error.status ?? 500;
        if (status === 500) log(`error: ${error.message}`);
        sendJson(status, { error: error.message });
      }
    });
  });

  return new Promise((resolveStart, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolveStart(server));
  });
}
