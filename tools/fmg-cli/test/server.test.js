import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { startServer } from "../src/server.js";

const fixture = process.env.FMG_FIXTURE ?? new URL("../../../tests/fixtures/1.154.0.map", import.meta.url).pathname;
const skip = !existsSync(fixture);

describe("API server", { skip }, () => {
  const dir = mkdtempSync(join(tmpdir(), "fmg-api-"));
  const token = "t".repeat(64);
  let server;
  let base;
  before(async () => {
    server = await startServer({ dir, port: 0, host: "127.0.0.1", token });
    base = `http://127.0.0.1:${server.address().port}/api`;
  });
  after(() => server.close());

  const api = (path, init = {}, auth = token) =>
    fetch(base + path, { ...init, headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), ...init.headers } });

  it("refuses requests without or with a wrong token", async () => {
    assert.equal((await api("/health", {}, null)).status, 401);
    assert.equal((await api("/health", {}, "nope")).status, 401);
    assert.equal((await api("/health")).status, 200);
  });

  it("refuses unsafe map names", async () => {
    const res = await api("/maps/..%2Fevil.map", { method: "PUT", body: Buffer.from("x") });
    assert.equal(res.status, 400);
    assert.equal((await api("/maps/notes.txt/info")).status, 400);
  });

  it("refuses an upload that is not a map", async () => {
    assert.equal((await api("/maps/Bad.map", { method: "PUT", body: Buffer.from("not a map") })).status, 400);
    assert.deepEqual(await (await api("/maps")).json(), []);
  });

  it("stores, reads, edits with a backup and diffs", async () => {
    const put = await api("/maps/Test.map", { method: "PUT", body: readFileSync(fixture) });
    assert.equal(put.status, 200);
    assert.equal((await (await api("/maps")).json()).length, 1);
    assert.ok((await (await api("/maps/Test.map/info")).json()).cells);

    const states = await (await api("/maps/Test.map/list?type=states&limit=2&fields=i,name")).json();
    assert.equal(states.length, 2);

    const ops = [{ op: "set", type: "states", ref: String(states[0].i ?? 1), field: "name", value: "Zedland" }];
    const dry = await (await api("/maps/Test.map/ops", { method: "POST", body: JSON.stringify({ ops, dryRun: true }) })).json();
    assert.equal(dry.written, null);
    const done = await (await api("/maps/Test.map/ops", { method: "POST", body: JSON.stringify({ ops }) })).json();
    assert.equal(done.written, "Test.map");
    assert.ok(existsSync(join(dir, "Test.map.bak")));
    const found = await (await api("/maps/Test.map/search?q=Zedland")).json();
    assert.ok(JSON.stringify(found).includes("Zedland"));

    await api("/maps/Old.map", { method: "PUT", body: readFileSync(fixture) });
    const diff = await (await api("/diff?old=Old.map&new=Test.map")).json();
    assert.ok(JSON.stringify(diff).includes("Zedland"));
  });

  it("changes nothing when one op is wrong", async () => {
    const before = readFileSync(join(dir, "Test.map"));
    const ops = [{ op: "set", type: "states", ref: "1", field: "name", value: "Fine" }, { op: "nonsense" }];
    const res = await api("/maps/Test.map/ops", { method: "POST", body: JSON.stringify({ ops }) });
    assert.equal(res.status, 400);
    assert.ok(readFileSync(join(dir, "Test.map")).equals(before));
  });
});
