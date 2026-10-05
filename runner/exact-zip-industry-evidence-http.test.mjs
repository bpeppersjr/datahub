import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { exactZipIndustryEvidenceHttp } from "./exact-zip-industry-evidence-http.mjs";
import { readExactZipIndustryEvidence } from "./national-exact-zip-industry-evidence-matrix.mjs";
import { readExactZipIndustryEvidenceWithTemporalQualification } from "./exact-zip-industry-temporal-qualification.mjs";

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
test("HTTP endpoint survives governed per-cell disposition enrichment",async()=>{const result=await call({reader:readExactZipIndustryEvidenceWithTemporalQualification});assert.equal(result.status,200);assert.equal(result.body.temporal_qualification.schema_version,"exact-zip-industry-temporal-qualification-view@1.1.0");assert.equal(result.body.temporal_qualification.rows.length,39);assert.ok(result.body.temporal_qualification.rows.every(row=>row.current_operations_verified===false&&row.evidence_disposition.current_operations_verified===false&&row.evidence_disposition.cell_status===result.body.row.cells[row.dimension_id].status));});
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
