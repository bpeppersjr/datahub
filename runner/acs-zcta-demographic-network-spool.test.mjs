import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {APP_ROOT} from "./paths.mjs";
import {spoolAcsJsonResponse} from "./acs-zcta-demographic-network-spool.mjs";

const url = "https://api.census.gov/data/2024/acs/acs5/groups/B01001.json";
const headers = (values = {}) => ({get(name) {return values[name.toLowerCase()] ?? null;}});
const body = (...chunks) => ({async *[Symbol.asyncIterator]() {for (const chunk of chunks) yield Buffer.from(chunk);}});
const response = (chunks, overrides = {}) => ({
  status: 200, ok: true, url,
  headers: headers({"content-type": "application/json; charset=utf-8", "content-length": String(Buffer.concat(chunks.map(Buffer.from)).length)}),
  body: body(...chunks), ...overrides,
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(APP_ROOT, "data/.test-acs-spool-")), directory = path.join(root, "data/acs-zcta-demographic-network/.staging/test-run");
  await fs.mkdir(directory, {recursive: true});
  t.after(async () => {await fs.rm(root, {recursive: true, force: true});});
  return {root, directory};
}

test("bounded source response is checksummed and atomically retained in app-owned staging", async (t) => {
  const f = await fixture(t), chunks = [Buffer.from('{"variables":'), Buffer.from("{}}")];
  const result = await spoolAcsJsonResponse({...f, filename: "metadata-B01001.json", response: response(chunks), expectedUrl: url, maximumBytes: 1000});
  const bytes = Buffer.concat(chunks);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(await fs.readFile(path.join(f.directory, result.path)), bytes);
  assert.equal(result.claims.network_requests, 1);
  assert.equal(result.claims.production_enrollment, false);
});

test("overflow, cancellation and malformed transport clean partial files and publish nothing", async (t) => {
  for (const [name, mutate, pattern] of [
    ["overflow", (f) => ({...f, maximumBytes: 3, response: response([Buffer.from("1234")])}), /ceiling/],
    ["content", (f) => ({...f, response: response([Buffer.from("{}")], {headers: headers({"content-type": "text/html"})})}), /content type/],
    ["url", (f) => ({...f, response: response([Buffer.from("{}")], {url: "https://example.com/"})}), /response URL/],
  ]) {
    const f = await fixture(t), args = {root: f.root, directory: f.directory, filename: "metadata-B01001.json", expectedUrl: url, maximumBytes: 1000};
    await assert.rejects(spoolAcsJsonResponse(mutate(args)), pattern, name);
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
  const f = await fixture(t), controller = new AbortController(); controller.abort();
  await assert.rejects(spoolAcsJsonResponse({root:f.root,directory:f.directory,filename:"metadata-B01001.json",response:response([Buffer.from("{}")]),expectedUrl:url,maximumBytes:1000,signal:controller.signal}), {name:"AbortError"});
  assert.deepEqual(await fs.readdir(f.directory), []);
});

test("immutable destination, linked staging and paths outside app-owned staging fail closed", async (t) => {
  const f = await fixture(t), args = {...f, filename:"metadata-B01001.json",response:response([Buffer.from("{}")]),expectedUrl:url,maximumBytes:1000};
  await fs.writeFile(path.join(f.directory, args.filename), "existing");
  await assert.rejects(spoolAcsJsonResponse(args), /destination exists/);
  const outside = path.join(f.root, "outside"); await fs.mkdir(outside);
  await assert.rejects(spoolAcsJsonResponse({...args, directory:outside, filename:"data-B01001.json"}), /app-owned staging/);
  const target = path.join(f.root, "target"); await fs.mkdir(target);
  const linked = path.join(f.root, "data/acs-zcta-demographic-network/.staging/linked"); await fs.symlink(target, linked, "junction");
  await assert.rejects(spoolAcsJsonResponse({...args, directory:linked, filename:"data-B01001.json"}), /app-owned staging|identity/);
});
