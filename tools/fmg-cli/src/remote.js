// Client for the fmg API: the same commands as on a local map, run on a server such as the Raspberry Pi
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

export function connection(opts) {
  const url = (opts.url || process.env.FMG_URL || "").replace(/\/+$/, "");
  const token = opts.token || process.env.FMG_TOKEN;
  if (!url) throw new Error("Where is the server? Set FMG_URL=http://<address>:5174 or use --url");
  if (!token) throw new Error("No token. Set FMG_TOKEN=<token> (the server prints it with `fmg token`) or use --token");
  return { url, token };
}

/** One request; JSON answers come back parsed, downloads as a Buffer */
export async function call(conn, method, path, { query, body, binary } = {}) {
  const url = new URL(`${conn.url}/api${path}`);
  for (const [key, value] of Object.entries(query ?? {}))
    for (const v of [].concat(value)) if (v !== undefined && v !== null) url.searchParams.append(key, v);
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${conn.token}`, ...(body && !Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}) },
    body: body && (Buffer.isBuffer(body) ? body : JSON.stringify(body))
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      message = JSON.parse(text).error ?? text;
    } catch {}
    throw new Error(`Server said ${response.status}: ${message}`);
  }
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

export const pushFile = (conn, path, name = basename(path)) => call(conn, "PUT", `/maps/${encodeURIComponent(name)}`, { body: readFileSync(path) });

export async function pullFile(conn, name, target = name) {
  const data = await call(conn, "GET", `/maps/${encodeURIComponent(name)}`, { binary: true });
  writeFileSync(target, data);
  return { saved: target, bytes: data.length };
}
