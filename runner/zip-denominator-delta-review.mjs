import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { APP_ROOT } from "./paths.mjs";
import { auditZipDenominators } from "./zip-denominator-audit.mjs";
const DATASET = "zip-denominator-delta-review";
const VERSION = "zip-denominator-delta-review@1.0.0";
const sha = (v) => createHash("sha256").update(v).digest("hex");
const bytes = (v) => Buffer.from(`${JSON.stringify(v)}\n`);
const fail = () => {
  throw Error("ZIP denominator delta review unavailable.");
};
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs&&a.nlink===b.nlink;
export async function stableRead(file){file=path.resolve(file);if(await realpath(file)!==file)fail();const handle=await open(file,"r");try{const before=await handle.stat({bigint:true});if(!before.isFile()||before.nlink!==1n)fail();const value=await handle.readFile();const after=await handle.stat({bigint:true}),current=await lstat(file,{bigint:true});if(!same(before,after)||!same(after,current)||await realpath(file)!==file)fail();return{value,bytes:value.length,sha256:sha(value),identity:after};}finally{await handle.close();}}
async function held(file){file=path.resolve(file);if(await realpath(file)!==file)fail();const handle=await open(file,"r");try{const identity=await handle.stat({bigint:true});if(!identity.isFile()||identity.nlink!==1n)fail();const value=await handle.readFile();return{file,handle,identity,value,sha256:sha(value)}}catch(error){await handle.close().catch(()=>{});throw error;}}
async function cohortSnapshot(root,pointerRel){const pointer=await held(path.join(root,pointerRel));let manifest;try{const p=JSON.parse(pointer.value);manifest=await held(path.resolve(path.dirname(pointer.file),p.manifest));const m=JSON.parse(manifest.value),decl=m.artifacts.find(a=>a.path==='derived/zip-coverage.jsonl'&&a.artifact_type==='registry-zip-coverage-jsonl');if(!decl)fail();const artifact=await held(path.join(path.dirname(manifest.file),decl.path));return{pointer,manifest,artifact}}catch(error){await pointer.handle.close().catch(()=>{});await manifest?.handle.close().catch(()=>{});throw error;}}
async function acquireSnapshots(root){const first=await cohortSnapshot(root,"data/business-registry/current.json");try{return[first,await cohortSnapshot(root,"data/migrations/normalized-us-postal-fields-v1/downstream/business-registry/current.json")]}catch(error){await releaseSnapshots([first]).catch(()=>{});throw error;}}
async function writeExact(file,value){const handle=await open(file,"wx");let primary;try{await handle.writeFile(value);await handle.sync();}catch(error){primary=error;throw error;}finally{try{await handle.close();}catch(error){if(!primary)throw error;}}}
async function releaseSnapshots(snapshots){let invalid=false;for(const snapshot of snapshots)for(const item of Object.values(snapshot)){try{const after=await item.handle.stat({bigint:true}),current=await lstat(item.file,{bigint:true});if(!same(item.identity,after)||!same(after,current)||await realpath(item.file)!==item.file)invalid=true;}catch{invalid=true;}finally{try{await item.handle.close();}catch{invalid=true;}}}if(invalid)fail();}
const EXPECTED = {
  production: {
    release_id: "national-business-registry-20260911-022652067Z-1ec656c3",
    pointer_sha256:
      "a5e5d58960e97ee51825ec558d1b59a356f7a98a15300db504a35df625ace1de",
    manifest_sha256:
      "d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76",
    artifact_sha256:
      "2bd91afb013e99203ccea4c6cd9e8d3182d4071918ab34d27bcdd8ad3344006e",
  },
  candidate: {
    release_id: "national-business-registry-20260907-140848014Z-9b1fdcb8",
    pointer_sha256:
      "f73299cbf72f98ffbd61009a022db0ecedbc2a2a0e94487571e12017eb19d54a",
    manifest_sha256:
      "7b18a2ffdb2448515be8dd9831f0d72c743cba755362e90f508b46c3bc0acace",
    artifact_sha256:
      "e8a1ac5f1b87c79e3c5f4b550c025f638f19a19bef6301d514589c501d54f4c2",
  },
};
function derive(report, createdAt) {
  if (
    report.overall_contract_status !== "passed" ||
    report.audit_mode !== "read-only"
  )
    fail();
  const production = report.cohorts.find(row => row.cohort_id === "production-current");
  const candidate = report.cohorts.find(row => row.cohort_id === "postal-migration-candidate");
  if (
    production.release_id !== EXPECTED.production.release_id ||
    production.pointer_sha256 !== EXPECTED.production.pointer_sha256 ||
    production.manifest_sha256 !== EXPECTED.production.manifest_sha256 ||
    production.artifact.sha256 !== EXPECTED.production.artifact_sha256 ||
    candidate.release_id !== EXPECTED.candidate.release_id ||
    candidate.pointer_sha256 !== EXPECTED.candidate.pointer_sha256 ||
    candidate.manifest_sha256 !== EXPECTED.candidate.manifest_sha256 ||
    candidate.artifact.sha256 !== EXPECTED.candidate.artifact_sha256
  )
    fail();
  const added = report.comparison?.zip5_rows_only_in_left?.zip5_values,
    removed = report.comparison?.zip5_rows_only_in_right?.zip5_values;
  if (!Array.isArray(added) || !Array.isArray(removed)) fail();
  const rows = new Map(production.rows.map((row) => [row.zip5, row]));
  const details = added.map((zip5) => {
    const row = rows.get(zip5);
    if (
      !row ||
      row.artifact_postal_fields.zip4 !== null ||
      row.split_postal_contract.zip4_is_geometric !== false ||
      row.usps_operational_evidence.status !== "unverified"
    )
      fail();
    return {
      zip5,
      zip4: null,
      direction: "added",
      source_provenance: row.positive_source_contributions,
      zcta_membership: row.governed_zcta_membership.status,
      placeholder:
        row.source_reported_zip5_quality.class === "explicit-placeholder",
      usps_status: "unverified",
      review_disposition: "local-review-required-no-admission-authorized",
    };
  });
  return {
    schema_version: VERSION,
    created_at: createdAt,
    audit_id: report.audit_id,
    classification: "registry ZIP evidence keys",
    not_operational_usps_denominator: true,
    production: {
      ...EXPECTED.production,
      key_count: production.counts.zip5_rows,
    },
    prior_candidate: {
      ...EXPECTED.candidate,
      artifact_sha256: candidate.artifact.sha256,
      key_count: candidate.counts.zip5_rows,
    },
    delta: {
      added_count: details.length,
      removed_count: removed.length,
      added_member_set_sha256:
        report.comparison.zip5_rows_only_in_left.zip5_member_set_sha256,
      removed_member_set_sha256:
        report.comparison.zip5_rows_only_in_right.zip5_member_set_sha256,
      by_source: Object.fromEntries(
        [
          ...new Set(
            details.flatMap((row) =>
              row.source_provenance.map((source) => source.source_id),
            ),
          ),
        ].map((source) => [
          source,
          details.filter((row) =>
            row.source_provenance.some((item) => item.source_id === source),
          ).length,
        ]),
      ),
      same_code_zcta_added: details.filter(
        (row) => row.zcta_membership === "in-denominator",
      ).length,
      placeholder_added: details.filter((row) => row.placeholder).length,
      usps_unverified_added: details.filter(
        (row) => row.usps_status === "unverified",
      ).length,
      review_disposition_counts: {
        "local-review-required-no-admission-authorized": details.length,
      },
    },
    local_review_drilldown: details,
    claims: {
      zip5_zip4_separate: true,
      zip4_geometric: false,
      zip_geometry_inferred: false,
      state_inferred: false,
      zip_invalidity_asserted: false,
      usps_operational_denominator_verified: false,
      admission_authorized: false,
      network_requests: 0,
      current_pointer_changed: false,
      production_executed: false,
    },
  };
}
export async function buildZipDenominatorDeltaReview({
  root = APP_ROOT,
  asOf = new Date(),
} = {}) {
  root = await realpath(path.resolve(root));
  const snapshots=await acquireSnapshots(root);
  let report;try{report=await auditZipDenominators({appRoot:root,includeRows:true,includeZipLists:true});}finally{await releaseSnapshots(snapshots);}
  if(snapshots[0].pointer.sha256!==EXPECTED.production.pointer_sha256||snapshots[0].manifest.sha256!==EXPECTED.production.manifest_sha256||snapshots[0].artifact.sha256!==EXPECTED.production.artifact_sha256||snapshots[1].pointer.sha256!==EXPECTED.candidate.pointer_sha256||snapshots[1].manifest.sha256!==EXPECTED.candidate.manifest_sha256||snapshots[1].artifact.sha256!==EXPECTED.candidate.artifact_sha256)fail();
  const artifact = derive(report, asOf.toISOString());
  const artifactBytes = bytes(artifact);
  const releaseId = `${DATASET}-${artifact.created_at.replace(/[^0-9]/g, "").slice(0, 17)}-${sha(artifactBytes).slice(0, 8)}`;
  const releases = path.join(root, "data", DATASET, "releases");
  await mkdir(releases, { recursive: true });
  const releasesStat = await lstat(releases);
  if (!releasesStat.isDirectory() || releasesStat.isSymbolicLink() || await realpath(releases) !== releases) fail();
  const directory = path.join(releases, releaseId);
  const staging=path.join(releases,`.staging-${randomUUID()}`);await mkdir(staging);
  const artifactPath = "delta-review.json";
  const manifest = {
    schema_version: `${DATASET}-manifest@1.0.0`,
    dataset_id: DATASET,
    release_id: releaseId,
    status: "published-local-review",
    created_at: artifact.created_at,
    current_pointer: null,
    network_requests: 0,
    production_pointer_changes: false,
    artifacts: [
      {
        path: artifactPath,
        artifact_type: "zip-denominator-delta-review-json",
        bytes: artifactBytes.length,
        sha256: sha(artifactBytes),
        record_count: 0,
      },
    ],
  };
  const manifestBytes = bytes(manifest);
  try{await writeExact(path.join(staging,artifactPath),artifactBytes);await writeExact(path.join(staging,"manifest.json"),manifestBytes);await rename(staging,directory);}catch(error){await rm(staging,{recursive:true,force:true}).catch(()=>{});throw error;}
  return {
    releaseDirectory: directory,
    manifest,
    manifest_sha256: sha(manifestBytes),
    artifact_sha256: sha(artifactBytes),
  };
}
export async function verifyZipDenominatorDeltaReview(
  manifestPath,
  { root = APP_ROOT } = {},
) {
  root = await realpath(path.resolve(root));
  manifestPath = path.resolve(manifestPath);
  if (
    !manifestPath.startsWith(
      path.join(root, "data", DATASET, "releases") + path.sep,
    )
  )
    fail();
  if(path.basename(manifestPath)!=="manifest.json"||await realpath(path.dirname(manifestPath))!==path.dirname(manifestPath))fail();
  const manifestProof = await stableRead(manifestPath);
  const manifest = JSON.parse(manifestProof.value);
  if (
    manifest.schema_version !== `${DATASET}-manifest@1.0.0` ||
    manifest.dataset_id !== DATASET ||
    !new RegExp(`^${DATASET}-\\d{17}-[a-f0-9]{8}$`).test(manifest.release_id) ||
    path.basename(path.dirname(manifestPath)) !== manifest.release_id ||
    manifest.status !== "published-local-review" ||
    manifest.current_pointer !== null ||
    manifest.network_requests !== 0 ||
    manifest.production_pointer_changes !== false ||
    manifest.artifacts?.length !== 1 || manifest.artifacts[0].path!=="delta-review.json" || manifest.artifacts[0].artifact_type!=="zip-denominator-delta-review-json" || manifest.artifacts[0].record_count!==0
  )
    fail();
  const artifactDecl = manifest.artifacts[0],
    artifactPath = path.join(path.dirname(manifestPath), artifactDecl.path);
  if(path.dirname(artifactPath)!==path.dirname(manifestPath))fail();
  if (
    JSON.stringify((await readdir(path.dirname(manifestPath))).sort()) !==
    JSON.stringify(["delta-review.json", "manifest.json"])
  )
    fail();
  const artifactProof = await stableRead(artifactPath);
  if (
    artifactProof.bytes !== artifactDecl.bytes ||
    artifactProof.sha256 !== artifactDecl.sha256
  )
    fail();
  const artifact = JSON.parse(artifactProof.value);
  const snapshots=await acquireSnapshots(root);
  let report;try{report=await auditZipDenominators({appRoot:root,includeRows:true,includeZipLists:true});}finally{await releaseSnapshots(snapshots);}
  if(snapshots[0].pointer.sha256!==EXPECTED.production.pointer_sha256||snapshots[0].manifest.sha256!==EXPECTED.production.manifest_sha256||snapshots[0].artifact.sha256!==EXPECTED.production.artifact_sha256||snapshots[1].pointer.sha256!==EXPECTED.candidate.pointer_sha256||snapshots[1].manifest.sha256!==EXPECTED.candidate.manifest_sha256||snapshots[1].artifact.sha256!==EXPECTED.candidate.artifact_sha256)fail();
  if (
    JSON.stringify(artifact) !==
    JSON.stringify(derive(report, artifact.created_at))
  )
    fail();
  return {
    release_id: manifest.release_id,
    manifest_sha256: manifestProof.sha256,
    artifact_sha256: artifactProof.sha256,
    artifact,
  };
}
