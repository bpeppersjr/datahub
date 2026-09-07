import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { APP_ROOT } from "./paths.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const token = "managed-api-fixture-token-that-is-long-enough-2026";
const timeout = (milliseconds, callback) => new Promise((resolve, reject) => {
  const timer = setTimeout(callback ? () => reject(callback()) : resolve, milliseconds);
  timer.unref();
});

async function unusedPort() {
  const socket = net.createServer();
  socket.unref();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function makeFixture(t) {
  const root = path.join(APP_ROOT, "data", "test-runtime", `managed-api-${randomUUID()}`);
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "runner"), { recursive: true });
  await cp(path.join(APP_ROOT, "config"), path.join(root, "config"), { recursive: true });
  for (const file of ["compose-flat-business-export.mjs"]) await copyFile(path.join(APP_ROOT, "scripts", file), path.join(root, "scripts", file));
  for (const file of ["paths.mjs", "cli-cancellation.mjs", "childcare-geographic-evidence.mjs", "normalized-us-postal-code.mjs"]) await copyFile(path.join(APP_ROOT, "runner", file), path.join(root, "runner", file));
  const industryConfig = JSON.parse(await readFile(path.join(root, "config", "industry-segments.json"), "utf8"));
  for (const source of Object.values(industryConfig.sources)) {
    const stub = path.join(root, ...source.script.split("/"));
    await mkdir(path.dirname(stub), { recursive: true });
    await writeFile(stub, "process.exitCode = 0;\n", { flag: "wx" }).catch((error) => { if (error.code !== "EEXIST") throw error; });
  }

  const release = path.join(root, "data", "business-registry", "release");
  await mkdir(path.join(release, "resolution", "location-profiles"), { recursive: true });
  const rows = [
    { names: [{ raw: "Review Store" }], address: { street: "1 Main", city: "Austin", state: "TX", zip_code: "78701-1234" }, location: { coordinates: [-97.74, 30.27] }, source: { source_id: "usda-snap-current-retailers", source_release_id: "s1", source_record_id: "r1", ingest_run_id: "i1", policy_id: "p1", transformation_version: "v1" }, export_policy: "local-review-only" },
    { names: [{ raw: "Second Store" }], address: { city: "Seattle", state: "WA", zip_code: "98101", zip4: "5678" }, location: { latitude: 47.6, longitude: -122.3 }, source: { source_id: "texas-comptroller-active-sales-tax-permits", source_release_id: "s2", source_record_id: "r2", ingest_run_id: "i2", policy_id: "p2", transformation_version: "v1" }, export_policy: "local-review-only" },
  ];
  const zipped = gzipSync(`${rows.map(JSON.stringify).join("\n")}\n`);
  const artifact = "resolution/location-profiles/zip2=00.jsonl.gz";
  await writeFile(path.join(release, ...artifact.split("/")), zipped);
  const manifest = { dataset_id: "national-business-registry", release_id: "fixture-1", status: "published-partial", artifacts: [{ path: artifact, artifact_type: "entity-resolution-location-profile-jsonl-gzip", bytes: zipped.length, sha256: sha256(zipped) }] };
  await writeFile(path.join(release, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "data", "business-registry", "current.json"), JSON.stringify({ dataset_id: manifest.dataset_id, release_id: manifest.release_id, manifest: "release/manifest.json" }));

  const port = await unusedPort();
  const child = spawn(process.execPath, [path.join(APP_ROOT, "runner", "server.mjs")], {
    cwd: APP_ROOT,
    env: { ...process.env, DATAHUB_ROOT: root, DATAHUB_CONTROL_TOKEN: token, RUNNER_HOST: "127.0.0.1", RUNNER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  let stderr = ""; child.stderr.on("data", (chunk) => { stderr += chunk; });
  await Promise.race([
    new Promise((resolve, reject) => { child.on("message", (message) => message?.type === "runner-ready" && resolve()); child.once("exit", (code) => reject(new Error(`runner exited ${code}: ${stderr}`))); }),
    timeout(8_000, () => new Error(`runner startup timed out: ${stderr}`)),
  ]);
  t.after(async () => {
    if (child.exitCode === null) { child.kill("SIGTERM"); await Promise.race([once(child, "exit"), timeout(3_000)]); }
    if (child.exitCode === null) child.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  });
  return { root, child, base: `http://127.0.0.1:${port}` };
}

async function request(base, route, { method = "GET", body, authenticated = true } = {}) {
  const headers = {};
  if (authenticated) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${base}${route}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5_000) });
}

async function waitForOperation(base, id) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await request(base, `/api/data-operations/operations/${id}`);
    assert.equal(response.status, 200);
    const operation = await response.json();
    if (!["QUEUED", "RUNNING"].includes(operation.status)) return operation;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("managed export did not finish");
}

test("managed operation HTTP API authenticates, validates, exports, and downloads governed artifacts", { timeout: 20_000 }, async (t) => {
  const fixture = await makeFixture(t);

  const unauthorized = await request(fixture.base, "/api/data-operations/catalog", { authenticated: false });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");

  const catalogResponse = await request(fixture.base, "/api/data-operations/catalog");
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.ok(catalog.export.policyModes.includes("local-review"));

  const bad = await request(fixture.base, "/api/data-operations/exports", { method: "POST", body: { format: "xml" } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /csv, jsonl, or both/);

  const planResponse = await request(fixture.base, "/api/data-operations/plan", { method: "POST", body: { industries: [catalog.industries[0].id], states: [catalog.states[0]] } });
  assert.equal(planResponse.status, 200);
  assert.ok(Number.isInteger((await planResponse.json()).taskCount));

  const start = await request(fixture.base, "/api/data-operations/exports", { method: "POST", body: { format: "both", policyMode: "local-review", fields: ["business_name", "state", "zip_code"], outputPrefix: "exported2" } });
  assert.equal(start.status, 202);
  const operation = await waitForOperation(fixture.base, (await start.json()).id);
  assert.equal(operation.status, "SUCCEEDED", operation.error);
  assert.equal(operation.result.rowsWritten, 2);
  assert.equal(operation.result.localReviewOnly, true);

  for (const declared of operation.artifacts) {
    const denied = await request(fixture.base, `/api/data-operations/operations/${operation.id}/artifacts/${declared.name}`, { authenticated: false });
    assert.equal(denied.status, 401);
    const response = await request(fixture.base, `/api/data-operations/operations/${operation.id}/artifacts/${declared.name}`);
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, declared.bytes);
    const disk = await readFile(path.join(fixture.root, "data", "managed-operations", operation.id, "output", "exported2", declared.name));
    assert.equal(sha256(bytes), sha256(disk));
  }

  const history = await request(fixture.base, "/api/data-operations/operations");
  assert.equal(history.status, 200);
  assert.ok((await history.json()).some((item) => item.id === operation.id && item.status === "SUCCEEDED"));
});

test("managed refresh schedule API creates disabled schedules without launching collection", { timeout: 20_000 }, async (t) => {
  const fixture = await makeFixture(t), route = "/api/data-operations/schedules";
  assert.equal((await request(fixture.base, route, { authenticated: false })).status, 401);
  const initial = await request(fixture.base, route); assert.equal(initial.status, 200); assert.deepEqual(await initial.json(), []);
  const invalid = await request(fixture.base, route, { method: "POST", body: { industries: ["retail-consumer"], states: ["TX"], intervalHours: 0 } });
  assert.equal(invalid.status, 400);
  const response = await request(fixture.base, route, { method: "POST", body: { industries: ["retail-consumer"], states: ["TX"], intervalHours: 24 } });
  assert.equal(response.status, 201); const schedule = await response.json(); assert.equal(schedule.enabled, false);
  const pause = await request(fixture.base, `${route}/${schedule.id}/enabled`, { method: "POST", body: { enabled: false } }); assert.equal(pause.status, 200);
  const invalidToggle = await request(fixture.base, `${route}/${schedule.id}/enabled`, { method: "POST", body: { enabled: false, command: "ignored" } }); assert.equal(invalidToggle.status, 400);
  const listed = await request(fixture.base, route); assert.equal((await listed.json()).length, 1);
  const operations = await request(fixture.base, "/api/data-operations/operations"); assert.deepEqual(await operations.json(), []);
  const exited = once(fixture.child, "exit"); fixture.child.send("shutdown"); await exited;
  await assert.rejects(readFile(path.join(fixture.root, "data/refresh-schedules/owner.lock")), /ENOENT/);
  assert.equal(JSON.parse(await readFile(path.join(fixture.root, "data/refresh-schedules/state.json"))).schedules[0].enabled, false);
});
