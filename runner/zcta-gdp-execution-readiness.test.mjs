import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyZctaGdpExecutionReadiness } from "./zcta-gdp-execution-readiness.mjs";
import { readZctaGdpExecutionReadiness } from "./zcta-gdp-execution-readiness-reader.mjs";
const ROOT = path.resolve(import.meta.dirname, ".."),
  registration = JSON.parse(
    await fs.readFile(
      path.join(ROOT, "config/datasets/zcta-gdp-execution-readiness.json"),
    ),
  );
test("selected full release replays exact HOLD cohort", async () => {
  const r = await verifyZctaGdpExecutionReadiness(
    registration.retained_release.manifest,
  );
  assert.equal(
    r.manifest_sha256,
    registration.retained_release.manifest_sha256,
  );
  assert.deepEqual(r.summary, {
    zctas: 33791,
    feasible_on_approval: 30576,
    withheld: 3215,
  });
  assert.equal(r.claims.numeric_gdp_emitted, false);
});
test("exact-ZCTA reader returns diagnostics without numeric output", async () => {
  const r = await readZctaGdpExecutionReadiness({ zcta: "00601" });
  assert.equal(r.available, true);
  assert.equal(r.readiness.decision_status, "hold");
  assert.equal(r.claims.numeric_gdp, false);
  assert.equal(JSON.stringify(r).includes("gdp_current_dollars"), false);
  assert.equal(
    Object.keys(r.readiness).some((k) => /estimate|amount|component/i.test(k)),
    false,
  );
});
test("reader validates exact ZCTA and preserves absence", async () => {
  await assert.rejects(
    readZctaGdpExecutionReadiness({ zcta: "601" }),
    (e) => e.statusCode === 400,
  );
  const r = await readZctaGdpExecutionReadiness({ zcta: "99999" });
  assert.equal(r.available, false);
  assert.equal(r.readiness, null);
});
