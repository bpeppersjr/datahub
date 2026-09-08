import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { createTnChildcareFixture } from "./fixtures/tn-childcare-fetch.mjs";
import { acquireTnChildcare } from "./tn-childcare-acquisition.mjs";

const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const blockNetwork = "data:text/javascript,globalThis.fetch%3D()%3D%3E%7Bthrow%20new%20Error('NETWORK_FORBIDDEN')%7D";
const recoverScript = "scripts/recover-tn-childcare.mjs", verifyScript = "scripts/verify-tn-childcare-recovered.mjs";
const execute = (script, args) => spawnSync(process.execPath, ["--import", blockNetwork, script, ...args], { cwd: APP_ROOT, windowsHide: true, encoding: "utf8", timeout: 15000 });
async function fixture(t) {
  const runId = `tn-recovery-cli-${randomUUID()}`, runRoot = path.join(APP_ROOT, "data/industry-segments/runs", runId), stagingPath = path.join(runRoot, "state-tn-childcare-TN/.staging", randomUUID());
  const temp = path.join(APP_ROOT, "data/tmp"); await mkdir(temp, { recursive: true }); const outputParent = await mkdtemp(path.join(temp, "tn-recovered-cli-")), outputRoot = path.join(outputParent, "output");
  t.after(async () => { await rm(runRoot, { recursive: true, force: true }); await rm(outputParent, { recursive: true, force: true }); });
  await mkdir(stagingPath, { recursive: true }); await mkdir(path.join(runRoot, "logs"));
  const acquired = await acquireTnChildcare({ fetchImpl: createTnChildcareFixture({ count: 20, mutate: (p, kind) => { if (kind === "features") { p.features[0].attributes.Zip = "0"; p.features[1].attributes.Zip = null; } } }).fetchImpl,
    sleep: async () => {}, now: () => new Date("2026-09-08T00:00:01.000Z") });
  const values = { "--selected-sha256": ["selected-features.jsonl", Buffer.from(acquired.features.map(row => `${JSON.stringify(row)}\n`).join(""))],
    "--observation-sha256": ["source-observation.json", Buffer.from(`${JSON.stringify(acquired.evidence)}\n`)], "--xml-sha256": ["publisher-metadata.xml", acquired.publisher_metadata.before.raw] };
  const args = ["--receipt", path.join(runRoot, "receipt.json"), "--staging", stagingPath], originals = new Map();
  for (const [flag, [name, bytes]] of Object.entries(values)) { await writeFile(path.join(stagingPath, name), bytes); args.push(flag, digest(bytes)); originals.set(path.join(stagingPath, name), bytes); }
  const logRelative = `data/industry-segments/runs/${runId}/logs/state-tn-childcare-TN.log`, logPath = path.join(APP_ROOT, logRelative), log = Buffer.from("acquire\nnormalize\nTennessee childcare build failed: Tennessee childcare release rejected: quarantine exceeds 5% or no accepted records.\n");
  await writeFile(logPath, log); originals.set(logPath, log);
  const receipt = { run_id: runId, status: "failed", started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", plan: { industries: ["childcare"], states: ["TN"] },
    tasks: [{ task_id: "state-tn-childcare:TN", source_id: "state-tn-childcare", state: "TN", status: "failed", code: 1, signal: null, started_at: "2026-09-08T00:00:00.000Z", finished_at: "2026-09-08T00:00:02.000Z", log: logRelative }], log_sha256: { "state-tn-childcare:TN": digest(log) } };
  const rawReceipt = Buffer.from(JSON.stringify(receipt)); await writeFile(args[1], rawReceipt); originals.set(args[1], rawReceipt); args.push("--receipt-sha256", digest(rawReceipt), "--output", outputRoot);
  return { args, outputRoot, originals, stagingPath };
}

test("TN recovered CLIs help and invalid arguments remain offline and redact input values", () => {
  for (const script of [recoverScript, verifyScript]) {
    const help = execute(script, ["--help"]); assert.equal(help.error, undefined); assert.equal(help.status, 0); assert.match(help.stdout, /Usage/);
    for (const args of [["--url", "PRIVATE_INPUT"], ["--help", "PRIVATE_INPUT"], []]) {
      const invalid = execute(script, args); assert.equal(invalid.error, undefined); assert.equal(invalid.status, 1); assert.doesNotMatch(invalid.stdout + invalid.stderr, /PRIVATE_INPUT|NETWORK_FORBIDDEN/);
    }
  }
  for (const args of [["--receipt", "a", "--receipt", "b"], ["--receipt", "a", "--output", ".."], ["--version", "1.0.0"]]) assert.equal(execute(recoverScript, args).status, 1);
  assert.equal(execute(verifyScript, ["current.json"]).status, 1);
});

test("TN recovery and independent verifier CLIs preserve original source evidence without network", async t => {
  const f = await fixture(t), child = execute(recoverScript, f.args);
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr); const result = JSON.parse(child.stdout);
  assert.equal(result.status, "complete"); assert.deepEqual(result.counts, { selected: 20, accepted: 20, quarantined: 0 });
  const checked = execute(verifyScript, [result.manifest_path]); assert.equal(checked.status, 0, checked.stderr);
  const verified = JSON.parse(checked.stdout); assert.equal(verified.status, "verified"); assert.equal(verified.artifact_count, 7); assert.equal(verified.manifest_sha256, result.manifest_sha256);
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
  await assert.rejects(readFile(path.join(f.outputRoot, ".publish.lock")), { code: "ENOENT" });
  assert.deepEqual(await readdir(path.join(f.outputRoot, ".staging")), []);
  const artifact = path.join(path.dirname(result.manifest_path), "normalized.jsonl");
  await writeFile(artifact, "PRIVATE_TAMPERED_ARTIFACT\n");
  const tampered = execute(verifyScript, [result.manifest_path]); assert.equal(tampered.status, 1);
  assert.doesNotMatch(tampered.stdout + tampered.stderr, /PRIVATE_TAMPERED_ARTIFACT|NETWORK_FORBIDDEN/);
});

test("TN recovery CLI rejects wrong pins duplicate flags and escaped outputs before publication", async t => {
  const f = await fixture(t), wrongPin = [...f.args]; wrongPin[wrongPin.indexOf("--receipt-sha256") + 1] = "0".repeat(64);
  const escaped = [...f.args]; escaped[escaped.indexOf("--output") + 1] = path.dirname(APP_ROOT);
  for (const args of [wrongPin, [...f.args, "--output", "PRIVATE_DUPLICATE"], escaped]) {
    const result = execute(recoverScript, args); assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_DUPLICATE|NETWORK_FORBIDDEN/);
  }
  await assert.rejects(readFile(path.join(f.outputRoot, "current.json")), { code: "ENOENT" });
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
});

test("TN recovery CLI IPC cancellation leaves no owned lock staging or publication", { timeout: 20000 }, async t => {
  const f = await fixture(t), child = spawn(process.execPath, ["--import", blockNetwork, recoverScript, ...f.args], { cwd: APP_ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exit = once(child, "exit"); let output = "", sent = 0;
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
  const cancel = setInterval(() => { if (child.connected) { sent++; child.send({ type: "cancel" }, () => {}); } }, 5), timeout = setTimeout(() => child.kill(), 15000);
  t.after(() => { clearInterval(cancel); clearTimeout(timeout); if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const [code, signal] = await exit; clearInterval(cancel); clearTimeout(timeout);
  assert.ok(sent > 0); assert.equal(code, 1, output); assert.equal(signal, null, output);
  for (const name of ["current.json", ".publish.lock"]) await assert.rejects(readFile(path.join(f.outputRoot, name)), { code: "ENOENT" });
  for (const name of [".staging", "releases"]) { try { assert.deepEqual(await readdir(path.join(f.outputRoot, name)), []); } catch (error) { if (error.code !== "ENOENT") throw error; } }
  for (const [file, bytes] of f.originals) assert.deepEqual(await readFile(file), bytes);
});
