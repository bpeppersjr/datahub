import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, symlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { acquireTnChildcare } from "./tn-childcare-acquisition.mjs";
import { inspectTnChildcareRecovery } from "./tn-childcare-recovery-inspection.mjs";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(t) {
  const temp = path.join(APP_ROOT, "data/tmp"); await mkdir(temp, { recursive: true }); const root = await mkdtemp(path.join(temp, "tn-recovery-inspect-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runId = "failed-fixture", runRoot = path.join(root, "data/industry-segments/runs", runId), stagingPath = path.join(runRoot, "state-tn-childcare-TN/.staging", randomUUID());
  await mkdir(stagingPath, { recursive: true }); await mkdir(path.join(runRoot, "logs"));
  const acquired = await acquireTnChildcare({ fetchImpl: createTnChildcareFixture({ count: 20, mutate: (p, kind) => {
    if (kind === "features") for (const [index, row] of p.features.entries()) { row.attributes.Provider_Name = "PRIVATE_NAME_DO_NOT_OUTPUT"; if (index < 2) row.attributes.Zip = "372010123"; }
  } }).fetchImpl, sleep: async () => {}, now: () => new Date("2026-09-08T00:00:01.000Z") });
  const values = { selectedFeatures: ["selected-features.jsonl", Buffer.from(acquired.features.map(row => `${JSON.stringify(row)}\n`).join(""))],
    sourceObservation: ["source-observation.json", Buffer.from(`${JSON.stringify(acquired.evidence)}\n`)], publisherMetadata: ["publisher-metadata.xml", acquired.publisher_metadata.before.raw] };
  const expectedHashes = {}, originals = new Map();
  for (const [key, [name, bytes]] of Object.entries(values)) { await writeFile(path.join(stagingPath, name), bytes); expectedHashes[key] = sha(bytes); originals.set(path.join(stagingPath, name), bytes); }
  const logRelative = `data/industry-segments/runs/${runId}/logs/state-tn-childcare-TN.log`, logPath = path.join(root, logRelative);
  const log = Buffer.from("acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.\n"); await writeFile(logPath, log); originals.set(logPath, log);
  const receipt = { run_id: runId, status: "failed", started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", plan: { industries: ["childcare"], states: ["TN"] },
    tasks: [{ task_id: "state-tn-childcare:TN", source_id: "state-tn-childcare", state: "TN", status: "failed", code: 1, signal: null, started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", log: logRelative }], log_sha256: { "state-tn-childcare:TN": sha(log) } };
  const receiptPath = path.join(runRoot, "receipt.json"), bytes = Buffer.from(JSON.stringify(receipt)); await writeFile(receiptPath, bytes); originals.set(receiptPath, bytes); expectedHashes.receipt = sha(bytes);
  return { root, stagingPath, receiptPath, expectedHashes, originals, logPath, receipt };
}
const input = f => ({ root: f.root, stagingPath: f.stagingPath, receiptPath: f.receiptPath, expectedHashes: f.expectedHashes });

test("TN inspector proves pinned failed acquisition offline and returns aggregates without PII or writes", async t => {
  const f = await fixture(t), prior = globalThis.fetch; globalThis.fetch = () => { throw new Error("Network forbidden"); };
  let result; try { result = await inspectTnChildcareRecovery(input(f)); } finally { globalThis.fetch = prior; }
  assert.equal(result.status, "eligible-for-recovery-review"); assert.equal(result.acquisition.selected_records, 20);
  assert.deepEqual(result.legacy_normalization.reasons, { "invalid-postal-code": 2 }); assert.equal(result.legacy_normalization.accepted, 18);
  assert.equal(result.legacy_normalization.zip_format_counts["nine-contiguous-digits"], 2);
  assert.equal(result.recovery_published, false); assert.equal(result.writes_performed, false); assert.equal(result.network_requests, 0);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_NAME|372010123|1 Main Street/); assert.equal(Object.keys(result.pins).length, 5);
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
  assert.deepEqual((await readdir(f.stagingPath)).sort(), ["publisher-metadata.xml", "selected-features.jsonl", "source-observation.json"]);
});

test("TN inspector rejects missing pins, changed artifacts and forged evidence even with updated external pin", async t => {
  for (const kind of ["pin", "selected", "observation", "xml", "rehashed-selected", "log"]) {
    const f = await fixture(t);
    if (kind === "pin") delete f.expectedHashes.receipt;
    else {
      const file = kind === "log" ? f.logPath : path.join(f.stagingPath, kind === "observation" ? "source-observation.json" : kind === "xml" ? "publisher-metadata.xml" : "selected-features.jsonl");
      await writeFile(file, "PRIVATE_ERROR_PAYLOAD"); if (kind === "rehashed-selected") f.expectedHashes.selectedFeatures = sha("PRIVATE_ERROR_PAYLOAD");
    }
    await assert.rejects(inspectTnChildcareRecovery(input(f)), error => /inspection failed/.test(error.message) && !error.message.includes("PRIVATE_ERROR_PAYLOAD"));
  }
});

test("TN inspector rejects wrong task lineage, nonfailure and chronology despite correctly repinned receipt", async t => {
  for (const mutate of [r => { r.status = "succeeded"; }, r => { r.tasks[0].state = "NJ"; }, r => { r.tasks.push(r.tasks[0]); },
    r => { r.tasks[0].log = "../secret"; }, r => { r.finished_at = r.started_at; }, r => { delete r.tasks[0].finished_at; }, r => { r.tasks[0].finished_at = r.tasks[0].started_at; }]) {
    const f = await fixture(t); mutate(f.receipt); const bytes = Buffer.from(JSON.stringify(f.receipt)); await writeFile(f.receiptPath, bytes); f.expectedHashes.receipt = sha(bytes);
    await assert.rejects(inspectTnChildcareRecovery(input(f)));
  }
});

test("TN inspector rejects added files, active publication lock and staging path aliases", async t => {
  for (const kind of ["extra", "lock", "link", "unpointed-release"]) {
    const f = await fixture(t);
    if (kind === "extra") await writeFile(path.join(f.stagingPath, "foreign.json"), "{}");
    if (kind === "lock") await writeFile(path.join(path.dirname(path.dirname(f.stagingPath)), ".publish.lock"), "{}");
    if (kind === "unpointed-release") await mkdir(path.join(path.dirname(path.dirname(f.stagingPath)), "releases", "retained-unpointed"), { recursive: true });
    if (kind === "link") { const alias = path.join(path.dirname(f.stagingPath), randomUUID()); await symlink(f.stagingPath, alias, "junction"); f.stagingPath = alias; }
    await assert.rejects(inspectTnChildcareRecovery(input(f)));
  }
});

test("TN inspector cancellation covers preflight and asynchronous bounded reads", async t => {
  const f = await fixture(t); await assert.rejects(inspectTnChildcareRecovery({ ...input(f), signal: AbortSignal.abort() }), { name: "AbortError" });
  const controller = new AbortController(); setImmediate(() => controller.abort());
  await assert.rejects(inspectTnChildcareRecovery({ ...input(f), signal: controller.signal }), { name: "AbortError" });
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
});

test("TN recovery inspection CLI help and invalid options never request recovery or print input values", () => {
  for (const args of [["--help"], ["--receipt", "PRIVATE_INPUT"], ["--receipt", "a", "--receipt", "b"]]) {
    const result = spawnSync(process.execPath, ["scripts/inspect-tn-childcare-recovery.mjs", ...args], { cwd: APP_ROOT, windowsHide: true, encoding: "utf8" });
    assert.equal(result.status, args[0] === "--help" ? 0 : 1); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_INPUT/);
  }
});
