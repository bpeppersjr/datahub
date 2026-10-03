import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, rename, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { auditZipDenominators } from "./zip-denominator-audit.mjs";
import { stableRead } from "./zip-denominator-delta-review.mjs";

export const DATASET = "zip-denominator-gap-cohort";
export const SCHEMA = `${DATASET}@1.0.0`;
const sha = value => createHash("sha256").update(value).digest("hex");
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const fail = message => { throw new Error(`ZIP denominator gap cohort rejected: ${message}.`); };
const EXPECTED = Object.freeze({
  registry_pointer: "a5e5d58960e97ee51825ec558d1b59a356f7a98a15300db504a35df625ace1de",
  registry_manifest: "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76",
  registry_zip_artifact: "2bd91afb013e99203ccea4c6cd9e8d3182d4071918ab34d27bcdd8ad3344006e",
  geography_pointer: "5f89350482630a7d2e888772512aca36fdd21f68c8d3f01f1113dc6c2c400403",
  geography_manifest: "5426cae150c0fba64f8ff43a48ca39c4e78b5b4ba8a8007fbd211615540d1c8b",
  zcta_index: "41cbef263f88514d6c6e139e54527350c23f9e05a96a9576a6d7b2478f28ffc6",
  candidate_zip_artifact: "e8a1ac5f1b87c79e3c5f4b550c025f638f19a19bef6301d514589c501d54f4c2",
  candidate_pointer: "f73299cbf72f98ffbd61009a022db0ecedbc2a2a0e94487571e12017eb19d54a",
  candidate_manifest: "7b18a2ffdb2448515be8dd9831f0d72c743cba755362e90f508b46c3bc0acace",
  candidate_release_id: "national-business-registry-20260907-140848014Z-9b1fdcb8",
});
const MAX_OUTPUT_BYTES=209_715_200,MAX_ROW_BYTES=32_768,MAX_ROWS=100_000,MAX_CLOCK_SKEW_MS=300_000;
const SOURCE_TIME_LOWER_BOUND="2026-09-11T02:26:52.067Z",MANIFEST_MTIME_TOLERANCE_MS=60_000;
const memberHash = values => sha(values.length ? `${values.join("\n")}\n` : "");
const contained = (root, child) => { const rel = path.relative(root, child); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
const call=async(hooks,name,value)=>{if(hooks?.[name])await hooks[name](value);};
const sameDir=(a,b)=>a&&b&&a.isDirectory()&&b.isDirectory()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino;

async function safeDirectory(root, target) {
  const data = await realpath(path.join(root, "data")), resolved = path.resolve(target);
  if (!contained(data, resolved)) fail("output escapes repository data");
  let cursor = data;
  for (const part of path.relative(data, resolved).split(path.sep)) {
    cursor = path.join(cursor, part);
    try { const s = await lstat(cursor); if (!s.isDirectory() || s.isSymbolicLink()) fail("output ancestry is not canonical"); }
    catch (error) { if (error.code !== "ENOENT") throw error; await mkdir(cursor); }
  }
  if (!contained(data, await realpath(resolved))) fail("output canonical path escapes repository data");
  return resolved;
}

async function exactInputs(root, signal, hooks) {
  signal?.throwIfAborted();
  const registryPointer = await stableRead(path.join(root, "data/business-registry/current.json"));
  await call(hooks,"afterInputRead",{path:path.join(root,"data/business-registry/current.json")});signal?.throwIfAborted();
  const registryPointerValue = JSON.parse(registryPointer.value);
  const registryManifestPath = path.join(root, "data/business-registry", registryPointerValue.manifest);
  const registryManifest = await stableRead(registryManifestPath), registryManifestValue = JSON.parse(registryManifest.value);
  const zipDecl = registryManifestValue.artifacts.find(row => row.path === "derived/zip-coverage.jsonl");
  if (!zipDecl || zipDecl.sha256 !== EXPECTED.registry_zip_artifact || zipDecl.bytes > 1_073_741_824 || zipDecl.record_count !== 48194) fail("registry ZIP declaration drifted");
  const zipArtifact = { sha256: zipDecl.sha256, bytes: zipDecl.bytes };
  signal?.throwIfAborted();
  const geographyPointer = await stableRead(path.join(root, "data/geography/current.json"));
  const geographyPointerValue = JSON.parse(geographyPointer.value);
  const geographyManifestPath = path.join(root, "data/geography", geographyPointerValue.manifest);
  const geographyManifest = await stableRead(geographyManifestPath), geographyManifestValue = JSON.parse(geographyManifest.value);
  const zctaDecl = geographyManifestValue.artifacts.find(row => row.path === "derived/index/zctas.jsonl");
  if (!zctaDecl || zctaDecl.sha256 !== EXPECTED.zcta_index || zctaDecl.bytes > 52_428_800 || zctaDecl.record_count !== 33791) fail("ZCTA index declaration drifted");
  const zctaIndex = { sha256: zctaDecl.sha256, bytes: zctaDecl.bytes };
  const candidatePointer = await stableRead(path.join(root, "data/migrations/normalized-us-postal-fields-v1/downstream/business-registry/current.json"));
  const candidatePointerValue = JSON.parse(candidatePointer.value), candidateManifestPath = path.join(path.dirname(path.join(root, "data/migrations/normalized-us-postal-fields-v1/downstream/business-registry/current.json")), candidatePointerValue.manifest);
  const candidateManifest = await stableRead(candidateManifestPath), candidateManifestValue = JSON.parse(candidateManifest.value);
  const candidateDecl = candidateManifestValue.artifacts.find(row => row.path === "derived/zip-coverage.jsonl"); if(!candidateDecl || candidateDecl.sha256!==EXPECTED.candidate_zip_artifact || candidateDecl.bytes>1_073_741_824 || candidateDecl.record_count!==48190)fail("postal candidate ZIP declaration drifted"); const candidateArtifact={sha256:candidateDecl.sha256,bytes:candidateDecl.bytes};
  if (registryPointer.sha256 !== EXPECTED.registry_pointer || registryManifest.sha256 !== EXPECTED.registry_manifest || zipArtifact.sha256 !== EXPECTED.registry_zip_artifact || geographyPointer.sha256 !== EXPECTED.geography_pointer || geographyManifest.sha256 !== EXPECTED.geography_manifest || zctaIndex.sha256 !== EXPECTED.zcta_index || candidatePointer.sha256!==EXPECTED.candidate_pointer || candidateManifest.sha256!==EXPECTED.candidate_manifest || candidatePointerValue.release_id!==EXPECTED.candidate_release_id || candidateManifestValue.release_id!==EXPECTED.candidate_release_id || candidateArtifact.sha256 !== EXPECTED.candidate_zip_artifact) fail("tracked retained input pin drifted");
  return { registryPointer, registryManifest, zipArtifact, geographyPointer, geographyManifest, zctaIndex, candidatePointer,candidateManifest,candidateArtifact, registryPointerValue, registryManifestValue, geographyPointerValue, geographyManifestValue };
}

const fingerprint=i=>JSON.stringify(Object.fromEntries(["registryPointer","registryManifest","zipArtifact","geographyPointer","geographyManifest","zctaIndex","candidatePointer","candidateManifest","candidateArtifact"].map(k=>[k,{sha256:i[k].sha256,bytes:i[k].bytes,identity:i[k].identity?{dev:String(i[k].identity.dev),ino:String(i[k].identity.ino),size:String(i[k].identity.size),mtimeNs:String(i[k].identity.mtimeNs),ctimeNs:String(i[k].identity.ctimeNs)}:null}])));

export function deriveZipDenominatorGapCohort(report, inputs, createdAt) {
  if (!Array.isArray(report?.cohorts) || !Array.isArray(report?.comparison?.zip5_rows_only_in_left?.zip5_values)) fail("retained audit is malformed");
  const production = report.cohorts.find(row => row.cohort_id === "production-current"), delta = new Set(report.comparison.zip5_rows_only_in_left.zip5_values ?? []);
  if (!production || production.rows?.length !== 48194 || delta.size !== 4) fail("retained audit shape drifted");
  const rows = production.rows.map(row => {
    const quality = row.source_reported_zip5_quality.class;
    const classification = quality === "explicit-placeholder" ? "explicit-placeholder" : row.governed_zcta_membership.status === "included" ? "same-code-census-zcta" : row.registry_coverage_status === "record-level-source-contribution" ? "source-contributed-outside-zcta" : "denominator-only-outside-zcta";
    return { schema_version:"zip-denominator-gap-row@1.0.0",zip5: row.zip5, classification, zcta_geoid: classification === "same-code-census-zcta" ? row.governed_zcta_membership.geoid : null, registry_coverage_status: row.registry_coverage_status, positive_source_contributions: row.positive_source_contributions, source_native_usps_status: row.usps_operational_evidence.status, source_native_usps_reason: row.usps_operational_evidence.reason, usps_validity: null, deliverability: null, inferred_state: null,business_count:null,current_operating_business_count:null,completeness_percent:null, production_only_vs_postal_candidate: delta.has(row.zip5) };
  }).sort((a,b)=>a.zip5.localeCompare(b.zip5));
  const groups = Object.fromEntries(["same-code-census-zcta","source-contributed-outside-zcta","denominator-only-outside-zcta","explicit-placeholder"].map(name => { const values=rows.filter(row=>row.classification===name).map(row=>row.zip5); return [name,{count:values.length,member_set_sha256:memberHash(values)}]; }));
  if (groups["same-code-census-zcta"].count!==33791 || groups["source-contributed-outside-zcta"].count!==14361 || groups["denominator-only-outside-zcta"].count!==41 || groups["explicit-placeholder"].count!==1 || rows.filter(row=>row.production_only_vs_postal_candidate).map(row=>row.zip5).join(",")!=="01065,01385,02363,45730") fail("classification conservation drifted");
  return { summary: { schema_version: SCHEMA, dataset_id: DATASET, created_at: createdAt, projection_kind: "pointer-free-retained-zip-denominator-gap-cohort", bindings: { registry_pointer_sha256: inputs.registryPointer.sha256, registry_manifest_sha256: inputs.registryManifest.sha256, registry_zip_artifact_sha256: inputs.zipArtifact.sha256, geography_pointer_sha256: inputs.geographyPointer.sha256, geography_manifest_sha256: inputs.geographyManifest.sha256, zcta_index_sha256: inputs.zctaIndex.sha256,candidate_pointer_sha256:inputs.candidatePointer.sha256,candidate_manifest_sha256:inputs.candidateManifest.sha256,candidate_release_id:EXPECTED.candidate_release_id, postal_candidate_zip_artifact_sha256: inputs.candidateArtifact.sha256 }, counts: { rows: rows.length, ...Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.count])), production_only_vs_postal_candidate:4 }, member_sets: groups, exact_production_only_vs_postal_candidate: ["01065","01385","02363","45730"], claims: { census_zcta_spatial_denominator:33791, authoritative_current_usps_zip_denominator:null, business_count:null,current_operating_business_count:null,completeness_percent:null,state_inferred:false,deliverability_inferred:false,network_requests:0,current_pointer_written:false,production_enrollment:false,production_execution:false } }, rows };
}

async function expected(root, createdAt, signal, hooks) { const inputs=await exactInputs(root,signal,hooks),before=fingerprint(inputs); signal?.throwIfAborted(); const report=await auditZipDenominators({appRoot:root,includeRows:true,includeZipLists:true}); signal?.throwIfAborted();const afterInputs=await exactInputs(root,signal);if(before!==fingerprint(afterInputs))fail("retained input changed during audit replay"); return { inputs, ...deriveZipDenominatorGapCohort(report,inputs,createdAt) }; }
async function writeExact(file,value,signal,hooks){const h=await open(file,"wx");try{for(let offset=0;offset<value.length;){signal?.throwIfAborted();const end=Math.min(offset+65536,value.length),r=await h.write(value,offset,end-offset,offset);if(r.bytesWritten!==end-offset)fail("short output write");offset=end;if(offset<value.length)await call(hooks,"duringWrite",{file,offset});}await h.sync();}finally{await h.close();}}

export async function buildZipDenominatorGapCohort({root=APP_ROOT,outputRoot=path.join(APP_ROOT,"data",DATASET),signal,_testHooks:hooks}={}){
  const invokedAt=new Date();if(!Number.isFinite(invokedAt.getTime()))fail("invocation clock unavailable");root=await realpath(path.resolve(root));if(hooks&&root===APP_ROOT)fail("test hooks require isolated root");const safe=await safeDirectory(root,outputRoot),e=await expected(root,invokedAt.toISOString(),signal,hooks);if(new Date(e.summary.created_at).getTime()>Date.now()+MAX_CLOCK_SKEW_MS)fail("derivative clock is in the future");const encoded=e.rows.map(row=>{const value=JSON.stringify(row);if(Buffer.byteLength(value)>MAX_ROW_BYTES)fail("row exceeds byte bound");return value;});if(encoded.length>MAX_ROWS)fail("row count exceeds bound");const rowBytes=Buffer.from(encoded.join("\n")+"\n"),summaryBytes=json(e.summary);if(rowBytes.length+summaryBytes.length>MAX_OUTPUT_BYTES)fail("output exceeds byte bound");const digest=sha(Buffer.concat([summaryBytes,rowBytes])),releaseId=`${DATASET}-${invokedAt.toISOString().replace(/[^0-9]/g,"").slice(0,17)}-${digest.slice(0,12)}`,releases=path.join(safe,"releases"),directory=path.join(releases,releaseId);await mkdir(releases,{recursive:true});
  const lock=path.join(releases,".build.lock"),staging=path.join(releases,`.${releaseId}.staging-${randomUUID()}`);let lockStat,stageStat,primary,published=false;const manifest={schema_version:`${DATASET}-manifest@1.0.0`,dataset_id:DATASET,release_id:releaseId,status:"immutable-local-derived-release",publication_mode:"pointer-free",created_at:e.summary.created_at,clock_policy:{source_time_lower_bound:SOURCE_TIME_LOWER_BOUND,maximum_future_skew_ms:MAX_CLOCK_SKEW_MS,manifest_mtime_tolerance_ms:MANIFEST_MTIME_TOLERANCE_MS,release_id_timestamp_digits:17},current_pointer:null,network_requests:0,production_enrollment:false,production_execution:false,artifacts:[{path:"summary.json",bytes:summaryBytes.length,sha256:sha(summaryBytes),record_count:1},{path:"cohort.jsonl",bytes:rowBytes.length,sha256:sha(rowBytes),record_count:48194}]};const manifestBytes=json(manifest);
  try{await mkdir(lock);lockStat=await lstat(lock,{bigint:true});await call(hooks,"afterLock",{lock});signal?.throwIfAborted();await call(hooks,"beforeStageMkdir",{staging});await mkdir(staging);stageStat=await lstat(staging,{bigint:true});await writeExact(path.join(staging,"cohort.jsonl"),rowBytes,signal,hooks);signal?.throwIfAborted();await writeExact(path.join(staging,"summary.json"),summaryBytes,signal,hooks);await writeExact(path.join(staging,"manifest.json"),manifestBytes,signal,hooks);signal?.throwIfAborted();await call(hooks,"preRename",{staging});signal?.throwIfAborted();await rename(staging,directory);published=true;await call(hooks,"postRename",{directory});signal?.throwIfAborted();await verifyZipDenominatorGapCohort(path.join(directory,"manifest.json"),{root,signal,releaseRoot:releases});}
  catch(error){primary=error;if(published){error.inspection_required=true;error.release_id=releaseId;}else if(stageStat)try{const now=await lstat(staging,{bigint:true});if(!sameDir(stageStat,now))fail("staging ownership changed");await call(hooks,"beforeStageCleanup",{staging});await rm(staging,{recursive:true});}catch{error.inspection_required=true;}throw error;}finally{if(lockStat)try{const now=await lstat(lock,{bigint:true});if(!sameDir(lockStat,now))fail("lock ownership changed");await call(hooks,"beforeLockCleanup",{lock});await rmdir(lock);}catch(error){if(primary)primary.inspection_required=true;else throw error;}}
  return{releaseDirectory:directory,manifest,manifest_sha256:sha(manifestBytes)};
}

export async function verifyZipDenominatorGapCohort(manifestPath,{root=APP_ROOT,signal,releaseRoot}={}){
  root=await realpath(path.resolve(root)); const directory=path.dirname(path.resolve(manifestPath)), releases=await realpath(releaseRoot??path.join(root,"data",DATASET,"releases")); if(!contained(releases,directory)||await realpath(directory)!==directory)fail("release path escapes canonical root");
  const entries=(await readdir(directory)).sort();if(JSON.stringify(entries)!==JSON.stringify(["cohort.jsonl","manifest.json","summary.json"]))fail("release inventory is not closed");
  for(const name of entries){const s=await lstat(path.join(directory,name));if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1)fail("release member is not a singly linked regular file");}
  const manifestProof=await stableRead(manifestPath),manifest=JSON.parse(manifestProof.value),summaryProof=await stableRead(path.join(directory,"summary.json")),rowProof=await stableRead(path.join(directory,"cohort.jsonl")); if(path.basename(directory)!==manifest.release_id||manifest.current_pointer!==null||manifest.network_requests!==0||manifest.production_enrollment!==false||manifest.production_execution!==false||manifest.artifacts?.length!==2)fail("manifest boundary drifted");
  const created=new Date(manifest.created_at),createdMs=created.getTime(),mtimeMs=Number(manifestProof.identity.mtimeMs);if(!Number.isFinite(createdMs)||created.toISOString()!==manifest.created_at||manifest.clock_policy?.source_time_lower_bound!==SOURCE_TIME_LOWER_BOUND||manifest.clock_policy?.maximum_future_skew_ms!==MAX_CLOCK_SKEW_MS||manifest.clock_policy?.manifest_mtime_tolerance_ms!==MANIFEST_MTIME_TOLERANCE_MS||manifest.clock_policy?.release_id_timestamp_digits!==17||createdMs<Date.parse(SOURCE_TIME_LOWER_BOUND)||createdMs>Date.now()+MAX_CLOCK_SKEW_MS||createdMs>mtimeMs+MANIFEST_MTIME_TOLERANCE_MS)fail("manifest clock is untruthful");
  for(const [index,proof] of [summaryProof,rowProof].entries()){const d=manifest.artifacts[index];if(proof.bytes!==d.bytes||proof.sha256!==d.sha256)fail("artifact integrity drifted");}
  const summary=JSON.parse(summaryProof.value), e=await expected(root,summary.created_at,signal), expectedRows=Buffer.from(e.rows.map(row=>JSON.stringify(row)).join("\n")+"\n"),digest=sha(Buffer.concat([json(e.summary),expectedRows])),expectedRelease=`${DATASET}-${manifest.created_at.replace(/[^0-9]/g,"").slice(0,17)}-${digest.slice(0,12)}`; if(summary.created_at!==manifest.created_at||manifest.release_id!==expectedRelease||!summaryProof.value.equals(json(e.summary))||!rowProof.value.equals(expectedRows))fail("release does not replay from retained inputs or content identity");
  if((await readdir(directory)).sort().join(",")!==entries.join(","))fail("inventory changed during verification");return{status:"verified",release_id:manifest.release_id,manifest_sha256:manifestProof.sha256,counts:summary.counts,claims:summary.claims};
}
