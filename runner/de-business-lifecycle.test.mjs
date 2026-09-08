import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { APP_ROOT } from "./paths.mjs";
import { buildDeBusinessLicenses, verifyDeBusinessLicenses, publishDeBusinessLicensesStaging, DE_BUSINESS_LICENSE_SCHEMA } from "./de-business-licenses.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(APP_ROOT, "data/tmp/de-lifecycle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const baseline = path.join(root, "baseline"); await mkdir(baseline);
  const bytes = Buffer.from(JSON.stringify({ zip_code: "19801", geography: {}, employer_baseline: {} }) + "\n");
  await mkdir(path.join(baseline, "derived"));
  await writeFile(path.join(baseline, "derived/zip-coverage.jsonl"), bytes);
  await writeFile(path.join(baseline, "manifest.json"), JSON.stringify({ dataset_id: "census-zbp-baseline", complete_national_release: true, release_id: "fixture", artifacts: [{ path: "derived/zip-coverage.jsonl", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }] }));
  await writeFile(path.join(baseline, "current.json"), JSON.stringify({ manifest: "manifest.json" }));
  const row = { socrata_row_id: "one", business_name: "Fixture LLC", license_number: "2026000001", category: "RETAIL", current_license_valid_from: "2026-01-01T00:00:00.000", current_license_valid_to: "2026-12-31T00:00:00.000", address_1: "100 Market St", city: "Wilmington", state: "DE", zip: "19801", country: "UNITED STATES" };
  return { root, options: { outputRoot: path.join(root, "output"), zbpPointer: path.join(baseline, "current.json"), sourceRecords: [row], catalogMetadata: { id: "5zy2-grhr", name: "Delaware Business Licenses", attribution: "Department of Finance, Division of Revenue", description: "Information for businesses currently licensed in Delaware.", license: { name: "Public Domain" }, rowsUpdatedAt: 1788175917, sourceRecordCount: 1, distinctLicenseCount: 1, columns: DE_BUSINESS_LICENSE_SCHEMA.map(([fieldName, dataTypeName]) => ({ fieldName, dataTypeName })) }, minimumLicenseRows: 1, logger: () => {} } };
}

test("Delaware precommit cancellation preserves prior release and sibling staging; postcommit cancellation finishes", async (t) => {
  const { options } = await fixture(t);
  const prior = await buildDeBusinessLicenses(options);
  const pointer = await readFile(prior.pointerPath);
  const sibling = path.join(options.outputRoot, ".staging", "foreign"); await mkdir(sibling); await writeFile(path.join(sibling, "keep"), "keep");
  const controller = new AbortController();
  await assert.rejects(buildDeBusinessLicenses({ ...options, signal: controller.signal, onBeforeCommit: () => controller.abort() }), { name: "AbortError" });
  assert.deepEqual(await readFile(prior.pointerPath), pointer);
  assert.deepEqual(await readdir(path.dirname(sibling)), ["foreign"]);
  await verifyDeBusinessLicenses(path.join(prior.releaseDirectory, "manifest.json"));
  const after = new AbortController();
  const published = await buildDeBusinessLicenses({ ...options, signal: after.signal, onAfterCommit: () => after.abort() });
  assert.equal(after.signal.aborted, true);
  await verifyDeBusinessLicenses(path.join(published.releaseDirectory, "manifest.json"));
});

test("Delaware ordinary failure retains complete staging and cancelled resume never removes it", async (t) => {
  const { options } = await fixture(t);
  await assert.rejects(buildDeBusinessLicenses({ ...options, onBeforeCommit: () => { throw new Error("fixture stop"); } }), /fixture stop/);
  const [run] = await readdir(path.join(options.outputRoot, ".staging"));
  const manifest = path.join(options.outputRoot, ".staging", run, "manifest.json");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(publishDeBusinessLicensesStaging({ outputRoot: options.outputRoot, stagingRunId: run, signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(verifyDeBusinessLicenses(manifest, { signal: controller.signal }), { name: "AbortError" });
  await verifyDeBusinessLicenses(manifest);
  const during = new AbortController();
  const pending = verifyDeBusinessLicenses(manifest, { signal: during.signal });
  setImmediate(() => during.abort());
  await assert.rejects(pending, { name: "AbortError" });
  await verifyDeBusinessLicenses(manifest);
});

test("Delaware source-loop cancellation closes writers and removes only its owned run", async (t) => {
  const { options } = await fixture(t);
  const controller = new AbortController();
  const row = options.sourceRecords[0];
  options.sourceRecords = [row, { ...row, socrata_row_id: "two" }];
  options.catalogMetadata.sourceRecordCount = 2;
  options.sourceRecords[Symbol.iterator] = function* () { yield row; controller.abort(); yield this[1]; };
  await assert.rejects(buildDeBusinessLicenses({ ...options, signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(await readdir(path.join(options.outputRoot, ".staging")), []);
});

test("Delaware refuses file output roots before source requests", async (t) => {
  const { root, options } = await fixture(t);
  const output = path.join(root, "foreign"); await writeFile(output, "keep");
  let calls = 0;
  await assert.rejects(buildDeBusinessLicenses({ ...options, outputRoot: output, fetchImpl: async () => { calls++; throw new Error("unexpected"); } }), /canonical/);
  assert.equal(calls, 0); assert.equal(await readFile(output, "utf8"), "keep");
});

test("Delaware commit faults with concurrent cancellation retain completed publication evidence", async (t) => {
  const { options } = await fixture(t);
  const controller = new AbortController();
  let releaseId;
  await assert.rejects(buildDeBusinessLicenses({ ...options, signal: controller.signal, onAfterCommit: () => { controller.abort(); throw new Error("fixture fault"); } }), (error) => {
    releaseId = error.releaseId;
    return error.code === "DE_PUBLICATION_INCOMPLETE" && error.phase === "post-publication";
  });
  const pointer = JSON.parse(await readFile(path.join(options.outputRoot, "current.json")));
  assert.equal(pointer.release_id, releaseId);
  await verifyDeBusinessLicenses(path.join(options.outputRoot, pointer.manifest));
});

test("Delaware precommit rename retry cancels promptly and closes owned writers", async (t) => {
  const { options } = await fixture(t);
  const controller = new AbortController();
  const original = fs.promises.rename;
  let attempts = 0, timer;
  fs.promises.rename = async (from, to) => {
    if (String(to).endsWith("current-business-licenses.jsonl.gz")) {
      attempts++; timer = setTimeout(() => controller.abort(), 10);
      throw Object.assign(new Error("fixture sharing failure"), { code: "EPERM" });
    }
    return original(from, to);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(buildDeBusinessLicenses({ ...options, signal: controller.signal }), { name: "AbortError" });
    assert.equal(attempts, 1);
    assert.deepEqual(await readdir(path.join(options.outputRoot, ".staging")), []);
  } finally { clearTimeout(timer); fs.promises.rename = original; syncBuiltinESMExports(); }
});

test("Delaware pointer-write fault retains moved release with publication-incomplete status", async (t) => {
  const { options } = await fixture(t);
  const original = fs.promises.writeFile;
  let releaseId;
  fs.promises.writeFile = async (filename, ...args) => {
    if (String(filename).includes("current.json.tmp-")) throw new Error("fixture pointer disk failure");
    return original(filename, ...args);
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(buildDeBusinessLicenses(options), (error) => { releaseId = error.releaseId; return error.code === "DE_PUBLICATION_INCOMPLETE" && error.phase === "pointer-write"; });
  } finally { fs.promises.writeFile = original; syncBuiltinESMExports(); }
  await verifyDeBusinessLicenses(path.join(options.outputRoot, "releases", releaseId, "manifest.json"));
  await assert.rejects(readFile(path.join(options.outputRoot, "current.json")), { code: "ENOENT" });
});

test("Delaware logger and lock cleanup faults cannot report committed work as cancelled", async (t) => {
  for (const fault of ["logger", "cleanup", "primary-and-cleanup"]) {
    const { options } = await fixture(t);
    const controller = new AbortController();
    const originalRm = fs.promises.rm;
    const originalWrite = fs.promises.writeFile;
    let releaseId;
    if (fault !== "logger") fs.promises.rm = async (filename, ...args) => {
      if (String(filename).endsWith(".publish.lock")) { controller.abort(); throw new Error("fixture cleanup failure"); }
      return originalRm(filename, ...args);
    };
    if (fault === "primary-and-cleanup") fs.promises.writeFile = async (filename, ...args) => {
      if (String(filename).includes("current.json.tmp-")) throw new Error("fixture primary pointer-write failure");
      return originalWrite(filename, ...args);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(buildDeBusinessLicenses({ ...options, signal: controller.signal, logger: (message) => {
        if (fault === "logger" && message.startsWith("Published")) { controller.abort(); throw new Error("fixture logger failure"); }
      } }), (error) => {
        releaseId = error.releaseId;
        return error.code === "DE_PUBLICATION_INCOMPLETE" && error.phase === (fault === "primary-and-cleanup" ? "pointer-write" : "post-publication");
      });
    } finally { fs.promises.rm = originalRm; fs.promises.writeFile = originalWrite; syncBuiltinESMExports(); }
    assert.equal(controller.signal.aborted, true);
    await verifyDeBusinessLicenses(path.join(options.outputRoot, "releases", releaseId, "manifest.json"));
    if (fault !== "primary-and-cleanup") assert.equal(JSON.parse(await readFile(path.join(options.outputRoot, "current.json"))).release_id, releaseId);
  }
});
