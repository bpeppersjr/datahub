import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { buildBusinessEntityResolution, createLocationMatchProfile, verifyBusinessEntityResolutionSourceReplay, readBoundedEntityResolutionReplayInput } from "./business-entity-resolution.mjs";
import {
  buildEntityResolutionBenchmarkLabelRelease,
  verifyEntityResolutionBenchmarkLabelRelease,
} from "./entity-resolution-benchmark-labels.mjs";
import { previewBenchmarkLabelFinalization, publishBenchmarkLabelFinalization } from "./benchmark-label-finalization.mjs";
import { getBenchmarkWorkingLabels, previewBenchmarkLabelImport, commitBenchmarkLabelImport } from "./benchmark-review-store.mjs";
import {
  buildEntityResolutionBenchmarkSample,
  evaluateBenchmarkLabels,
  verifyEntityResolutionBenchmarkSample,
  verifyEntityResolutionBenchmarkSourceReplay,
  wilsonLowerBound,
} from "./entity-resolution-benchmark.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function profile({ sourceId, recordId, name, street, zipCode = "60601" }) {
  const siteId = `site:${sourceId}_${recordId}`;
  const establishmentId = `establishment:${sourceId}_${recordId}`;
  return createLocationMatchProfile({
    normalized_record_id: `${sourceId}:${recordId}`,
    observed_at: "2026-08-30T20:00:00.000Z",
    export_policy: "public",
    provenance: {
      source_id: sourceId,
      source_release_id: `${sourceId}-release`,
      source_record_id: recordId,
      ingest_run_id: `${sourceId}-run`,
      transformation_version: `${sourceId}@1.0.0`,
      policy_id: `${sourceId}-policy`,
    },
  }, {
    zipCode,
    entities: [
      { entity_id: siteId, entity_type: "physical_site" },
      { entity_id: establishmentId, entity_type: "establishment" },
    ],
    assertions: [
      {
        subject_entity_id: siteId,
        predicate: "site.address",
        value: { street, unit_or_additional: null, city: "Chicago", state: "IL", zip_code: zipCode, country: "US" },
      },
      { subject_entity_id: establishmentId, predicate: "establishment.name", value: name },
      { subject_entity_id: establishmentId, predicate: "establishment.source-status", value: { value: "fixture-current" } },
    ],
    relationships: [{ relationship_type: "located_at", subject_entity_id: establishmentId, object_entity_id: siteId }],
  });
}

async function writeFixtureRegistry(root, profiles) {
  const releaseId = "registry-benchmark-fixture";
  const releaseDirectory = path.join(root, "releases", releaseId);
  const artifacts = [];
  for (let prefix = 0; prefix < 100; prefix += 1) {
    const zip2 = String(prefix).padStart(2, "0");
    const records = profiles.filter((item) => item.zip_code.startsWith(zip2));
    const buffer = gzipSync(records.map((item) => JSON.stringify(item)).join("\n") + (records.length ? "\n" : ""));
    const relativePath = `resolution/location-profiles/zip2=${zip2}.jsonl.gz`;
    const destination = path.join(releaseDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    artifacts.push({
      path: relativePath,
      bytes: buffer.length,
      sha256: sha256(buffer),
      record_count: records.length,
      artifact_type: "entity-resolution-location-profile-jsonl-gzip",
    });
  }
  const manifest = {
    dataset_id: "national-business-registry",
    release_id: releaseId,
    status: "published-partial",
    complete_national_business_registry: false,
    publisher: { id: "national-business-registry", version: "2.7.0" },
    coverage: { physical_sites: profiles.length, resolution_location_profiles: profiles.length },
    artifacts,
  };
  await writeFile(path.join(releaseDirectory, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await mkdir(root, { recursive: true });
  const pointerPath = path.join(root, "current.json");
  await writeFile(pointerPath, `${JSON.stringify({ dataset_id: manifest.dataset_id, release_id: releaseId, manifest: `releases/${releaseId}/manifest.json` })}\n`);
  return pointerPath;
}

function completedLabel(candidate, label = "match") {
  return {
    schema_version: "1.0.0",
    candidate_id: candidate.candidate_id,
    label,
    reviewer_id: "fixture-reviewer",
    reviewed_at: "2026-08-30T22:00:00.000Z",
    evidence_note: label === "match" ? null : "Fixture evidence supports this non-match or exclusion.",
    evidence_references: [],
  };
}

test("benchmark source replay rejects rehashed evidence, universe, dependency, cancellation and unsafe paths", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "benchmark-replay-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registryPointer = await writeFixtureRegistry(path.join(root, "registry"), [
    profile({ sourceId: "one", recordId: "1", name: "Example Shop", street: "10 Main St" }),
    profile({ sourceId: "two", recordId: "2", name: "Example Shop", street: "10 Main St" }),
  ]);
  const registryPath = path.join(path.dirname(registryPointer), JSON.parse(await readFile(registryPointer)).manifest);
  const resolution = await buildBusinessEntityResolution({ registryPointer, outputRoot: path.join(root, "resolution"), logger() {} });
  const resolutionPath = path.join(resolution.releaseDirectory, "manifest.json");
  const resolutionSnapshot = await readFile(resolutionPath), registrySnapshot = await readFile(registryPath);
  await assert.rejects(verifyBusinessEntityResolutionSourceReplay(resolutionPath,registryPath,{expectedResolutionManifestSha256:"0".repeat(64)}),/snapshot mismatch/);
  await assert.rejects(verifyBusinessEntityResolutionSourceReplay(resolutionPath,registryPath,{expectedRegistryManifestSha256:"0".repeat(64)}),/snapshot mismatch/);
  await writeFile(resolutionPath,Buffer.concat([resolutionSnapshot,Buffer.from(" ")]));
  await assert.rejects(verifyBusinessEntityResolutionSourceReplay(resolutionPath,registryPath,{expectedResolutionManifestSha256:sha256(resolutionSnapshot),expectedRegistryManifestSha256:sha256(registrySnapshot)}),/snapshot mismatch/);
  await writeFile(resolutionPath,resolutionSnapshot);
  const benchmark = await buildEntityResolutionBenchmarkSample({ registryPointer, resolutionPointer: resolution.pointerPath, outputRoot: path.join(root,"benchmark"), logger() {} });
  const benchmarkPath = path.join(benchmark.releaseDirectory,"manifest.json");
  const clean = await readFile(benchmarkPath);
  const replay = (options) => verifyEntityResolutionBenchmarkSourceReplay(benchmarkPath,resolutionPath,registryPath,options);
  assert.equal((await replay()).source_replay_verified,true);
  const candidate = benchmark.manifest.artifacts.find(a=>a.path.endsWith("benchmark-candidates.jsonl.gz"));
  const candidatePath = path.join(benchmark.releaseDirectory,candidate.path), candidateClean = await readFile(candidatePath);
  const rows = gunzipSync(candidateClean).toString().trim().split("\n").map(JSON.parse);
  rows[0].left_profile.address.street = "999 Invented Street";
  const changed = gzipSync(rows.map(row=>JSON.stringify(row)).join("\n")+"\n");
  await writeFile(candidatePath,changed); candidate.bytes=changed.length; candidate.sha256=sha256(changed);
  await writeFile(benchmarkPath,JSON.stringify(benchmark.manifest));
  await verifyEntityResolutionBenchmarkSample(benchmarkPath);
  await assert.rejects(replay(),/embedded source evidence/);
  await writeFile(candidatePath,candidateClean); await writeFile(benchmarkPath,clean);
  const altered = JSON.parse(clean), summaryArtifact = altered.artifacts.find(a=>a.path.endsWith("sample-summary.json"));
  const summaryPath=path.join(benchmark.releaseDirectory,summaryArtifact.path), summaryClean=await readFile(summaryPath);
  altered.coverage.candidate_universe["automatic-physical-site"]++;
  const summaryBytes=Buffer.from(JSON.stringify(altered.coverage));
  await writeFile(summaryPath,summaryBytes);summaryArtifact.bytes=summaryBytes.length;summaryArtifact.sha256=sha256(summaryBytes);
  await writeFile(benchmarkPath,JSON.stringify(altered));
  await verifyEntityResolutionBenchmarkSample(benchmarkPath);
  await assert.rejects(replay(),/universe or summary/);
  await writeFile(summaryPath,summaryClean); await writeFile(benchmarkPath,clean);
  const mismatch=JSON.parse(clean);mismatch.dependencies.registry.manifest_sha256="0".repeat(64);
  await writeFile(benchmarkPath,JSON.stringify(mismatch));await assert.rejects(replay(),/dependency mismatch/);
  await writeFile(benchmarkPath,clean);
  const controller=new AbortController();controller.abort();await assert.rejects(replay({signal:controller.signal}),{name:"AbortError"});
  const unsafe=JSON.parse(clean);unsafe.artifacts[0].path="../escape";
  await writeFile(benchmarkPath,JSON.stringify(unsafe));await assert.rejects(replay(),/artifact roster/);
  await writeFile(benchmarkPath,clean);
  const linked=path.join(root,"linked-benchmark");
  await symlink(benchmark.releaseDirectory,linked,"junction");
  await assert.rejects(verifyEntityResolutionBenchmarkSourceReplay(path.join(linked,"manifest.json"),resolutionPath,registryPath),/linked ancestors/);
});

test("bounded dependency reader cancels while consuming a compressed partition",async(t)=>{
  const root=await mkdtemp(path.join(tmpdir(),"dependency-cancel-"));t.after(()=>rm(root,{recursive:true,force:true}));
  const filename=path.join(root,"rows.gz");
  const bytes=gzipSync((JSON.stringify({padding:"x".repeat(10000)})+"\n").repeat(15000));
  await writeFile(filename,bytes);
  const controller=new AbortController();
  // Arm cancellation only after the pipeline installs its abort listener, then let
  // decompression consume data before aborting this deliberately large partition.
  const original=controller.signal.addEventListener.bind(controller.signal);let timer;
  controller.signal.addEventListener=(...args)=>{const result=original(...args);if(args[0]==="abort"&&!timer)timer=setTimeout(()=>controller.abort(),20);return result;};
  await assert.rejects(readBoundedEntityResolutionReplayInput(filename,{bytes:bytes.length,sha256:sha256(bytes),record_count:15000},{signal:controller.signal},true),{name:"AbortError"});
  clearTimeout(timer);
});

test("computes a conservative Wilson lower bound", () => {
  assert(wilsonLowerBound(384, 384) >= 0.99);
  assert(wilsonLowerBound(383, 384) < 0.99);
});

test("requires complete independently labeled automatic strata before passing precision", () => {
  const candidates = ["automatic-physical-site", "automatic-establishment", "review-candidate"].flatMap(
    (stratum) => Array.from({ length: 425 }, (_, index) => ({ candidate_id: `${stratum}-${index}`, stratum })),
  );
  const passing = candidates.map((candidate) => completedLabel(candidate));
  const result = evaluateBenchmarkLabels(candidates, passing);
  assert.equal(result.automatic_precision_gate_passed, true);
  assert.equal(result.export_authorized, false);

  const oneError = passing.map((label, index) => index === 0 ? { ...label, label: "non-match", evidence_note: "Confirmed different sites." } : label);
  assert.equal(evaluateBenchmarkLabels(candidates, oneError).strata["automatic-physical-site"].precision_gate_passed, false);

  const incomplete = passing.slice(1);
  assert.equal(evaluateBenchmarkLabels(candidates, incomplete).automatic_precision_gate_passed, false);
});

test("builds and independently verifies a deterministic enriched benchmark sample from registry publisher 2.7.0", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "entity-resolution-benchmark-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profiles = [];
  for (let index = 0; index < 384; index += 1) {
    const street = `${1000 + index} Site Test Street`;
    profiles.push(profile({ sourceId: `site-a-${index}`, recordId: "1", name: `Alpha Market ${index}`, street }));
    profiles.push(profile({ sourceId: `site-b-${index}`, recordId: "2", name: `Beta Pharmacy ${index}`, street }));
  }
  for (let index = 0; index < 384; index += 1) {
    const street = `${2000 + index} Establishment Test Street`;
    profiles.push(profile({ sourceId: `exact-a-${index}`, recordId: "1", name: `Exact Health ${index}`, street }));
    profiles.push(profile({ sourceId: `exact-b-${index}`, recordId: "2", name: `Exact Health ${index}`, street }));
  }
  for (let index = 0; index < 384; index += 1) {
    const street = `${3000 + index} Review Test Street`;
    profiles.push(profile({ sourceId: `review-a-${index}`, recordId: "1", name: `Acme Health Clinic ${index}`, street }));
    profiles.push(profile({ sourceId: `review-b-${index}`, recordId: "2", name: `Acme Health Clinics ${index}`, street }));
  }
  const registryPointer = await writeFixtureRegistry(path.join(root, "registry"), profiles);
  const resolution = await buildBusinessEntityResolution({
    outputRoot: path.join(root, "resolution"),
    registryPointer,
    now: () => new Date("2026-08-30T21:00:00.000Z"),
    logger: () => {},
  });
  const benchmark = await buildEntityResolutionBenchmarkSample({
    outputRoot: path.join(root, "data", "business-entity-resolution-benchmark"),
    resolutionPointer: resolution.pointerPath,
    registryPointer,
    sampleSizePerStratum: 384,
    now: () => new Date("2026-08-30T22:00:00.000Z"),
    logger: () => {},
  });
  assert.deepEqual(benchmark.manifest.coverage.sampled_candidates, {
    "automatic-physical-site": 384,
    "automatic-establishment": 384,
    "review-candidate": 384,
  });
  const verified = await verifyEntityResolutionBenchmarkSample(path.join(benchmark.releaseDirectory, "manifest.json"));
  assert.equal(verified.candidates.length, 1152);
  assert(verified.candidates.every((candidate) => candidate.left_profile.source && candidate.right_profile.source));

  {
    const larger=await buildEntityResolutionBenchmarkSample({outputRoot:path.join(root,"larger-sample"),resolutionPointer:resolution.pointerPath,registryPointer,sampleSizePerStratum:385,logger(){}});
    const largerVerified=await verifyEntityResolutionBenchmarkSample(path.join(larger.releaseDirectory,"manifest.json"));
    const ids=new Set(verified.candidates.map(c=>c.candidate_id));
    const substitute=largerVerified.candidates.find(c=>c.stratum==="automatic-physical-site"&&!ids.has(c.candidate_id));
    assert(substitute,"fixture must have a nonminimum valid candidate");
    const rows=structuredClone(verified.candidates),index=rows.findIndex(c=>c.stratum==="automatic-physical-site"),oldId=rows[index].candidate_id;
    rows[index]=substitute;
    rows.sort((a,b)=>a.stratum.localeCompare(b.stratum)||a.sample_priority_sha256.localeCompare(b.sample_priority_sha256));
    const templates=rows.map(c=>({...verified.labels.find(l=>l.candidate_id===(c.candidate_id===substitute.candidate_id?oldId:c.candidate_id)),candidate_id:c.candidate_id}));
    const altered=structuredClone(benchmark.manifest),saved=[];
    altered.coverage.unique_profiles_in_review_packet=new Set(rows.flatMap(c=>[c.left_profile_id,c.right_profile_id])).size;
    for(const [suffix,bytes] of [["benchmark-candidates.jsonl.gz",gzipSync(rows.map(r=>JSON.stringify(r)).join("\n")+"\n")],["label-template.jsonl",Buffer.from(templates.map(r=>JSON.stringify(r)).join("\n")+"\n")],["sample-summary.json",Buffer.from(JSON.stringify(altered.coverage))]]){
      const artifact=altered.artifacts.find(a=>a.path.endsWith(suffix)),filename=path.join(benchmark.releaseDirectory,artifact.path);
      saved.push([filename,await readFile(filename)]);await writeFile(filename,bytes);artifact.bytes=bytes.length;artifact.sha256=sha256(bytes);
    }
    const benchmarkPath=path.join(benchmark.releaseDirectory,"manifest.json");saved.push([benchmarkPath,await readFile(benchmarkPath)]);await writeFile(benchmarkPath,JSON.stringify(altered));
    await verifyEntityResolutionBenchmarkSample(benchmarkPath);
    const registryPath=path.join(path.dirname(registryPointer),JSON.parse(await readFile(registryPointer)).manifest);
    await assert.rejects(verifyEntityResolutionBenchmarkSourceReplay(benchmarkPath,path.join(resolution.releaseDirectory,"manifest.json"),registryPath),/deterministic replay/);
    for(const[filename,bytes]of saved)await writeFile(filename,bytes);
  }

  await assert.rejects(buildEntityResolutionBenchmarkLabelRelease({
    outputRoot: path.join(root, "empty-label-release"),
    benchmarkPointer: benchmark.pointerPath,
    workRoot: path.join(root, "empty-label-work"),
  }), /preview and explicit publish workflow/);

  // Exercise the registered, preview-bound publication path against an isolated
  // fixture root. The empty live workspace is never touched by this test.
  const appRoot = root;
  const benchmarkPointerPath = benchmark.pointerPath;
  const benchmarkManifestPath = path.join(benchmark.releaseDirectory, "manifest.json");
  const benchmarkManifestBytes = await readFile(benchmarkManifestPath);
  const relativeManifest = path.relative(appRoot, benchmarkManifestPath).replaceAll("\\", "/");
  const relativePointer = path.relative(appRoot, benchmarkPointerPath).replaceAll("\\", "/");
  const configPath = async (relative) => path.join(appRoot, relative);
  const benchmarkRegistration = {
    dataset_id: "national-business-entity-resolution-benchmark",
    current_verified_sample: { release_id: benchmark.manifest.release_id, manifest: relativeManifest, manifest_sha256: sha256(benchmarkManifestBytes) },
    runtime_pointer: relativePointer,
  };
  await mkdir(await configPath("config/datasets"), { recursive: true });
  await mkdir(await configPath("config/schemas"), { recursive: true });
  await mkdir(await configPath("config/source-policies"), { recursive: true });
  await writeFile(await configPath("config/datasets/national-business-entity-resolution-benchmark.json"), JSON.stringify(benchmarkRegistration));
  const repoRoot = process.cwd();
  for (const relative of [
    "config/datasets/national-business-entity-resolution-benchmark-labels.json",
    "config/schemas/business-entity-resolution-benchmark-label.schema.json",
    "config/source-policies/national-business-entity-resolution-benchmark.json",
  ]) await writeFile(await configPath(relative), await readFile(path.join(repoRoot, relative)));
  const workRoot = path.join(root, "review-work");
  const draft = await getBenchmarkWorkingLabels({ pointerPath: benchmarkPointerPath, workRoot });
  const outputRoot = path.join(root, "data", "business-entity-resolution-benchmark-labels");
  const emptyPreview = await previewBenchmarkLabelFinalization({
    appRoot, benchmarkPointerPath, workRoot, outputRoot,
    operatorId: "fixture-publisher", expectedRevision: draft.revision,
  });
  assert.equal(emptyPreview.ready, false);
  assert.equal(emptyPreview.preview_token, null);
  assert.equal(emptyPreview.submitted_label_count, 0);
  await assert.rejects(publishBenchmarkLabelFinalization({
    appRoot, benchmarkPointerPath, workRoot, outputRoot,
    operatorId: "fixture-publisher", expectedRevision: draft.revision,
    previewToken: "0".repeat(64), confirmation: "PUBLISH LABEL SNAPSHOT",
  }), /independently completed label/);
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  await assert.rejects(readFile(workRoot), { code: "ENOENT" });
  const rows = verified.candidates.map((candidate) => completedLabel(candidate));
  const upload = `${rows.map((label) => JSON.stringify(label)).join("\n")}\n`;
  const diagnosticPath = path.join(root, "diagnostic-labels.jsonl");
  await writeFile(diagnosticPath, upload);
  const diagnostic = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "evaluate-entity-resolution-benchmark.mjs"), "--labels", diagnosticPath], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATAHUB_ROOT: appRoot },
  });
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(Object.values(JSON.parse(diagnostic.stdout).strata).reduce((sum, item) => sum + item.submitted, 0), 1152);
  await writeFile(diagnosticPath, `${upload}${JSON.stringify(rows[0])}\n`);
  const malformedDiagnostic = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "evaluate-entity-resolution-benchmark.mjs"), "--labels", diagnosticPath], {
    cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATAHUB_ROOT: appRoot },
  });
  assert.notEqual(malformedDiagnostic.status, 0);
  const importPreview = await previewBenchmarkLabelImport({
    pointerPath: benchmarkPointerPath, workRoot, jsonl: upload,
    importingOperatorId: "fixture-importer", expectedRevision: draft.revision,
  });
  await commitBenchmarkLabelImport({
    pointerPath: benchmarkPointerPath, workRoot, jsonl: upload,
    importingOperatorId: "fixture-importer", expectedRevision: draft.revision,
    previewToken: importPreview.preview_token,
  });
  const completedDraft = await getBenchmarkWorkingLabels({ pointerPath: benchmarkPointerPath, workRoot });
  const options = {
    appRoot, benchmarkPointerPath, workRoot,
    outputRoot,
    operatorId: "fixture-publisher", expectedRevision: completedDraft.revision,
  };
  const finalization = await previewBenchmarkLabelFinalization(options);
  assert.equal(finalization.ready, true);
  assert.equal(finalization.export_authorized, false);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(publishBenchmarkLabelFinalization({
    ...options, previewToken: finalization.preview_token, confirmation: "PUBLISH LABEL SNAPSHOT", signal: aborted.signal,
  }), { name: "AbortError" });
  await assert.rejects(readFile(path.join(outputRoot, "current.json")), { code: "ENOENT" });
  await assert.rejects(publishBenchmarkLabelFinalization({
    ...options, previewToken: "0".repeat(64), confirmation: "PUBLISH LABEL SNAPSHOT",
  }), /preview no longer matches/);
  const publishRequest = { ...options, previewToken: finalization.preview_token, confirmation: "PUBLISH LABEL SNAPSHOT" };
  const [published, racedPublish] = await Promise.all([
    publishBenchmarkLabelFinalization(publishRequest),
    publishBenchmarkLabelFinalization(publishRequest),
  ]);
  assert.equal(published.automatic_precision_gate_passed, true);
  assert.equal(published.export_authorized, false);
  assert.equal(racedPublish.release_id, published.release_id);
  const verifyManifest = path.join(options.outputRoot, "releases", published.release_id, "manifest.json");
  const verifiedLabels = await verifyEntityResolutionBenchmarkLabelRelease(verifyManifest, { appRoot });
  assert.equal(verifiedLabels.coverage.submitted_labels, 1152);
  assert.equal(verifiedLabels.export_authorized, false);
  const recovered = await publishBenchmarkLabelFinalization({
    ...options, previewToken: finalization.preview_token, confirmation: "PUBLISH LABEL SNAPSHOT",
  });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.release_id, published.release_id);
  const submittedArtifact = (await readFile(verifyManifest, "utf8")).trim();
  const verifiedManifest = JSON.parse(submittedArtifact);
  const labelsPath = path.join(path.dirname(verifyManifest), verifiedManifest.artifacts.find((item) => item.path === "labels/submitted-labels.jsonl.gz").path);
  const pristineLabels = await readFile(labelsPath);
  await writeFile(labelsPath, Buffer.concat([pristineLabels, Buffer.from("tamper")]));
  await assert.rejects(verifyEntityResolutionBenchmarkLabelRelease(verifyManifest, { appRoot }), /hash or size differs/);

  const labelsArtifact = benchmark.manifest.artifacts.find(
    (artifact) => artifact.artifact_type === "entity-resolution-benchmark-label-template-jsonl",
  );
  const labelPath = path.join(benchmark.releaseDirectory, labelsArtifact.path);
  const labels = (await readFile(labelPath, "utf8")).trim().split("\n").map(JSON.parse);
  labels[0] = completedLabel(verified.candidates.find((candidate) => candidate.candidate_id === labels[0].candidate_id));
  const tampered = Buffer.from(`${labels.map((label) => JSON.stringify(label)).join("\n")}\n`);
  await writeFile(labelPath, tampered);
  labelsArtifact.bytes = tampered.length;
  labelsArtifact.sha256 = sha256(tampered);
  await writeFile(path.join(benchmark.releaseDirectory, "manifest.json"), `${JSON.stringify(benchmark.manifest)}\n`);
  await assert.rejects(
    verifyEntityResolutionBenchmarkSample(path.join(benchmark.releaseDirectory, "manifest.json")),
    /verification failed/,
  );

  const candidateArtifact = benchmark.manifest.artifacts.find(
    (artifact) => artifact.artifact_type === "entity-resolution-benchmark-candidate-jsonl-gzip",
  );
  const candidateRows = gunzipSync(await readFile(path.join(benchmark.releaseDirectory, candidateArtifact.path))).toString("utf8").trim().split("\n");
  assert.equal(candidateRows.length, 1152);
});
