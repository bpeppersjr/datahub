import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import matrixV32 from "../config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json" with { type: "json" };
import { exactZipIndustryEvidenceHttp } from "./exact-zip-industry-evidence-http.mjs";
import { readExactZipIndustryEvidence } from "./national-exact-zip-industry-evidence-matrix.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualification } from "./exact-zip-industry-temporal-qualification.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualificationV32 } from "./exact-zip-industry-temporal-qualification-v3-2.mjs";
import { APP_ROOT } from "./paths.mjs";

const sample = (zip5) => ({
  schema_version: "national-exact-zip-industry-evidence-matrix@1.8.0",
  status: "present",
  row: null,
  zip5,
});
async function call({
  method = "GET",
  query = "?zip=00601",
  headers = {},
  reader = ({ zip5 }) => sample(zip5),
} = {}) {
  let reply,
    reads = 0,
    cache;
  const request = Object.assign(new EventEmitter(), {
      method,
      headers,
      resume() {},
    }),
    response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      setHeader(name, value) {
        if (name === "Cache-Control") cache = value;
      },
    });
  await exactZipIndustryEvidenceHttp(
    request,
    response,
    new URL(`http://local/${query}`),
    async (opts) => {
      reads++;
      return reader(opts);
    },
    (_r, status, body) => {
      reply = { status, body };
    },
  );
  return { ...reply, reads, cache };
}

test("accepts one bodyless exact-ZIP GET and disables caching", async () => {
  const result = await call({});
  assert.equal(result.status, 200);
  assert.equal(result.reads, 1);
  assert.equal(result.cache, "no-store");
  for (const input of [
    { method: "POST" },
    { query: "" },
    { query: "?zip=601" },
    { query: "?zip=00601&zip=00602" },
    { query: "?zip=00601&extra=1" },
    { headers: { "content-length": "2" } },
    { headers: { "transfer-encoding": "chunked" } },
  ]) {
    const bad = await call(input);
    assert.equal(bad.status, 400);
    assert.equal(bad.reads, 0);
  }
});
test("HTTP JSON preserves null values for absent/outside cells and numeric zero only for measured-zero", async () => {
  const result = await call({ reader: readExactZipIndustryEvidence });
  assert.equal(result.status, 200);
  for (const cell of Object.values(result.body.row.cells)) {
    if (cell.status === "absent-from-retained-source-rows" || cell.status === "outside-source-denominator") {
      assert.equal(cell.count, null);
    } else if (cell.status === "measured-zero") {
      assert.equal(cell.count, 0);
    } else if (cell.status === "positive") {
      assert.ok(Number.isSafeInteger(cell.count) && cell.count > 0);
    } else {
      assert.fail(`unexpected status ${cell.status}`);
    }
  }
  assert.equal(result.body.serialized_status_value_counts["absent-from-retained-source-rows"].null_cells, 1237187);
  assert.equal(result.body.serialized_status_value_counts["absent-from-retained-source-rows"].numeric_cells, 0);
});
test("HTTP endpoint survives governed per-cell disposition enrichment",async()=>{const result=await call({reader:readExactZipIndustryEvidenceWithTemporalQualification});assert.equal(result.status,200);assert.equal(result.body.temporal_qualification.schema_version,"exact-zip-industry-temporal-qualification-view@1.1.0");assert.equal(result.body.temporal_qualification.rows.length,40);assert.ok(result.body.temporal_qualification.rows.every(row=>row.current_operations_verified===false&&row.evidence_disposition.current_operations_verified===false&&row.evidence_disposition.cell_status===result.body.row.cells[row.dimension_id].status));});
test("v3.2 HTTP reports verified cohort absence without evidence or geography inference", async () => {
  const result = await call({
    query: "?zip=00100",
    reader: readExactZipIndustryEvidenceWithTemporalQualificationV32,
  });
  assert.equal(result.status, 200);
  assert.equal(result.cache, "no-store");
  assert.deepEqual(result.body, {
    schema_version: "national-exact-zip-industry-evidence-row@3.2.0",
    status: "absent",
    reason: "outside-retained-cohort",
    zip5: "00100",
    row: null,
    temporal_qualification: null,
    release_id: matrixV32.retained_release.release_id,
    manifest_sha256: matrixV32.retained_release.manifest_sha256,
    full_matrix_replay_performed: false,
    recursive_lineage_verified: true,
  });
});

test("v3.2 HTTP rejects a changed enrolled row instead of returning cohort absence", async (t) => {
  const fixtureParent = path.resolve(APP_ROOT, "data");
  const root = await mkdtemp(path.join(fixtureParent, ".test-exact-zip-v32-"));
  assert.equal(path.dirname(path.resolve(root)), fixtureParent);
  t.after(() => rm(root, { recursive: true, force: true }));
  const manifest = matrixV32.retained_release.manifest;
  const registration = "config/datasets/national-exact-zip-industry-evidence-matrix-v3-2.json";
  for (const file of [registration, manifest]) {
    const target = path.join(root, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(APP_ROOT, file), target);
  }
  const partition = path.join(path.dirname(manifest), "prefix=10.json");
  const original = await readFile(path.join(APP_ROOT, partition), "utf8");
  const corrupt = original.replace('"zip5":"10001"', '"zip5":"10000"');
  assert.notEqual(corrupt, original);
  assert.equal(Buffer.byteLength(corrupt), Buffer.byteLength(original));
  await writeFile(path.join(root, partition), corrupt);

  const result = await call({
    query: "?zip=10001",
    reader: options => readExactZipIndustryEvidenceWithTemporalQualificationV32({ ...options, root }),
  });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { error: "Exact-ZIP industry evidence is unavailable or incompatible." });
});
test("redacts failures and aborts bounded reads on disconnect", async () => {
  const failed = await call({
    reader: () => {
      throw Error("C:/secret/token-value");
    },
  });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /secret|token-value/);
  let signal,
    writes = 0;
  const request = Object.assign(new EventEmitter(), {
      method: "GET",
      headers: {},
      resume() {},
    }),
    response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      destroyed: false,
      setHeader() {},
    });
  const pending = exactZipIndustryEvidenceHttp(
    request,
    response,
    new URL("http://local/?zip=00601"),
    async (opts) => {
      signal = opts.signal;
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Error("private")), {
          once: true,
        }),
      );
    },
    () => writes++,
  );
  request.emit("aborted");
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(writes, 0);
});
test("server wires the route after authentication to the bounded reader", async () => {
  const server = await readFile(
      new URL("./server.mjs", import.meta.url),
      "utf8",
    ),
    authorize = server.indexOf("controlPlane.authorize(request)"),
    route = server.indexOf(
      "url.pathname === '/api/business-map/exact-zip-industry-evidence'",
    );
  assert.ok(authorize >= 0 && route > authorize);
  assert.match(
    server,
    /exactZipIndustryEvidenceHttp\(request,response,url,readExactZipIndustryEvidenceWithTemporalQualification,json\)/,
  );
});
