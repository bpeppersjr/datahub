import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { APP_ROOT } from "./paths.mjs";
import { readNationalReportingSnapshot } from "./national-reporting-snapshot.mjs";
import { readSelectedIrsStateSummary } from "./irs-eo-state-summary.mjs";

test("selected IRS state, territory, and ZIP evidence conserves the governed filing-address cohort", async () => {
  const pointerPath = path.join(APP_ROOT, "data/business-coverage-views/current.json"), snapshot = await readNationalReportingSnapshot({ pointerPath });
  const sourceRow = snapshot.sources.find(row => row.source_key === "irs_eo_bmf_organizations");
  const state = await readSelectedIrsStateSummary({ pointerPath, coverageManifest: snapshot.manifest, sourceRow });
  assert.equal(Object.keys(state.counts).length, 56);
  assert.equal(Object.values(state.counts).reduce((sum, count) => sum + count, 0), 1_955_841);
  assert.equal(["AS", "GU", "MP", "PR", "VI"].reduce((sum, code) => sum + state.counts[code], 0), 3_408);
  assert.equal(state.acceptedOrganizations, 1_955_841);

  const registryPin = snapshot.manifest.dependencies.find(row => row.dataset_id === "national-business-registry");
  const registry = JSON.parse(await readFile(path.join(APP_ROOT, "data/business-registry/releases", registryPin.release_id, "manifest.json"), "utf8"));
  const irsPin = registry.dependencies.find(row => row.dataset_id === "irs-eo-bmf-organizations");
  const release = path.join(APP_ROOT, "data/business-sources/irs-eo-bmf-organizations/releases", irsPin.release_id);
  const manifest = JSON.parse(await readFile(path.join(release, "manifest.json"), "utf8"));
  const artifact = manifest.artifacts.find(row => row.artifact_type === "irs-eo-bmf-zip-coverage-jsonl");
  let bytes = 0, positive = 0, exactZcta = 0, outsideZcta = 0, total = 0; const hash = createHash("sha256");
  const stream = createReadStream(path.join(release, artifact.path)); stream.on("data", chunk => { bytes += chunk.length; hash.update(chunk); });
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) if (line) {
    const row = JSON.parse(line), count = row.irs_eo_bmf_current_snapshot.organization_filing_address_count;
    if (count > 0) { positive += 1; total += count; if (row.geography?.geoid === row.zip_code) exactZcta += 1; else outsideZcta += 1; }
  }
  assert.equal(bytes, artifact.bytes); assert.equal(hash.digest("hex"), artifact.sha256);
  assert.deepEqual({ positive, exactZcta, outsideZcta, total }, { positive: 36_950, exactZcta: 31_847, outsideZcta: 5_103, total: 1_955_841 });
});

test("Heatmap UI labels IRS filing-address limitations", async () => {
  const ui = await readFile(new URL("../app/business-intelligence.tsx", import.meta.url), "utf8");
  assert.match(ui, /tax-exempt-organizations/);
  assert.match(ui, /not a verified physical site or proof of current operations/);
  assert.match(ui, /no all-business completeness denominator/);
});
