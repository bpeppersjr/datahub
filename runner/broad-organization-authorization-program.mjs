import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
  verifyBroadOrganizationAcquisitionBacklog,
} from "./broad-organization-acquisition-backlog.mjs";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_SCHEMA_VERSION = "1.0.0";
export const BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID = "broad-organization-authorization-program";
export const DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID);
export const DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT = path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases");

export const AUTHORIZATION_PROGRAM_WAVES = Object.freeze([
  Object.freeze(["AK", "DC", "IL", "MS", "AR", "KY", "HI", "KS", "NV", "UT"]),
  Object.freeze(["WA", "TX", "OK", "AL", "AZ", "CA", "GA", "ID", "IN", "LA"]),
  Object.freeze(["MA", "MD", "ME", "MI", "MN", "MO", "MT", "NC", "ND", "NH"]),
  Object.freeze(["NJ", "NM", "OH", "RI", "SC", "SD", "TN", "VA", "VT", "WI"]),
  Object.freeze(["WV", "WY", "NE"]),
]);

const NO_ACTION_BOUNDARY = Object.freeze({
  contact_authorized: false, contact_performed: false,
  download_authorized: false, download_performed: false,
  payment_authorized: false, payment_performed: false,
  record_request_authorized: false, records_requested: 0,
  row_bearing_evidence_authorized: false, production_change_authorized: false,
  no_contact: true, no_download: true, no_payment: true, no_record_request: true,
});

// Contract language is intentionally local, non-row-bearing, and non-authorizing.
const CONTRACTS = Object.freeze({
  "address-role": ["Official field dictionary or schema-only documentation identifying each address role and ZIP field.", "Every retained address role is explicitly classified as administrative, mailing, registered, principal, or other; unknown and person-linked roles are excluded, and ZIP5/ZIP+4 handling is specified."],
  automation: ["Published or already-held written documentation of the officially supported automated access method, limits, authentication, and permitted use.", "The publisher documents an approved repeatable access path and limits without scraping, search enumeration, or circumventing controls; any needed permission remains separately ungranted."],
  "automation-boundary": ["Written description of allowed and prohibited automation for the identified product, including rate and authentication requirements.", "Permitted operations are explicit and compatible with a reviewed bounded connector; prohibited scraping, browser automation, and access-control bypass remain excluded."],
  "bulk-route": ["Official product page or written product specification identifying a current complete organization-level bulk route, exact population scope, exclusions, delivery mode, and control totals; metadata only.", "A current complete organization-level extract and its bounded delivery route are documented without accessing records; search/login access, filing access, statutory availability, or an unbounded portal is not accepted as bulk-delivery evidence."],
  "change-contract": ["Schema-only documentation describing full snapshots, deltas, deletions, corrections, replay, cadence, timestamps, and checksums.", "A repeatable reconciliation contract identifies inserts, updates, deletions, replay behavior, observation time, and integrity controls; unresolved semantics remain explicit."],
  "complete-snapshot-route": ["Current official non-row-bearing complete-extract or bounded-export specification covering population, historical exclusions, result caps, control totals, and supported delivery.", "The documented route can account for the complete declared population and detect truncation. Advanced-search partitioning, public search access, and CSV export availability alone do not satisfy the gate; the older-than-ten-years inactive-record exclusion remains explicit."],
  "current-bulk-scope": ["Current official documentation defining bulk-export population, included entity classes, exclusions, and control counts.", "The intended complete legal-entity population and material exclusions are documented with a publisher control total or an explicit statement that no control total exists."],
  "current-product": ["Current official Texas Business Entity master-unload product specification and unsigned order/price terms identifying edition availability, population, file inventory, and delivery.", "The material establishes an available business-organization product rather than only a historical price or portal order screen. UCC layouts/cadence and Comptroller franchise-tax or sales-tax products are not substitutes. No account, order, payment, or source request is authorized."],
  "csv-schema": ["Current versioned CSV dictionary and empty header/layout documenting encoding, quoting, columns, types, nulls, UBI, status, address roles, postal fields, and excluded fields.", "The exact export format supports a deterministic organization-only allowlist and drift detection. Public detail-page field labels cannot substitute for the CSV contract; registered-agent and person/contact fields remain excluded."],
  "eligible-address-role": ["Official schema-only field dictionary distinguishing organization addresses from agent, officer, owner, and residential addresses.", "A deterministic allowlist identifies organization-level administrative address roles; personal, agent, residential, and ambiguous roles are excluded."],
  "entity-type-scope": ["Official product scope statement enumerating domestic, foreign, active, inactive, and entity-type coverage.", "Included entity types and statuses are enumerated and reconcile to the intended organization scope; unsupported classes are not implied covered."],
  "exact-scope": ["Official product specification of exact extract scope, exclusions, counts, and delivery cadence.", "The product population, exclusions, and expected snapshot scope are unambiguous and support a bounded organization-only projection."],
  "full-export-terms": ["Current non-row-bearing product specification, versioned schema or empty layout, aggregate control totals, unsigned commercial terms, and rights terms for the uncapped full export.", "The complete intended population, fields, exclusions, control total, exact price and obligations, retention, transformation, derived publication, and redistribution rights are all explicit; capped, split, truncated, sampled, purchased, enrolled, or accepted-term access is not authorized by this program."],
  "large-acquisition-authorization": ["Approval-only gate: no document, upload, evidence packet, or publisher response can close it. Closure requires a separate authenticated, scope-specific user authorization for an exact reviewed proposal.", "Only a separate authenticated authority decision naming and approving the exact reviewed acquisition proposal can close this gate; this program and all attached documents grant no acquisition or row-bearing authority."],
  "migration-continuity": ["Official migration or transition notice identifying current/replacement products, post-cutover availability, authoritative route, layout compatibility, identifier crosswalk, and continuity rules.", "An actually available current edition and delivery path are documented with cutover, layout, and identifier continuity handled explicitly; superseded catalogs and historical inventory are not proof of current availability."],
  price: ["Official published price schedule or written quote with one-time, recurring, access, and renewal charges.", "All applicable charges and renewal obligations are explicit and separately reviewed; no payment, order, or financial commitment is authorized."],
  privacy: ["Official field inventory or schema-only documentation sufficient to classify personal, sensitive, contact, and document fields.", "A reviewed field allowlist and exclusion list prevent person-linked, sensitive, contact, document, signature, and free-text data from entering the projection."],
  redistribution: ["Published license or written terms covering retention, transformation, derived publication, redistribution, attribution, and revocation.", "A reviewed rights basis expressly covers the intended derived publication and redistribution; absent or revocable rights remain a blocking gate."],
  "refresh-contract": ["Official freshness and refresh documentation covering cadence, snapshot date, completeness, replacement, and deletion behavior.", "A bounded refresh plan can identify authoritative as-of dates, full/delta behavior, replacement and deletion semantics, and any publisher control totals."],
  rights: ["Published license or written permissions covering retention, transformation, derived publication, and redistribution.", "A documented, reviewed legal basis covers each intended use and attribution; public visibility alone is not accepted as permission."],
  schema: ["Versioned schema, field list, or header-only documentation without record values.", "Field names, types, nullability, keys, address roles, status fields, and version-change behavior are documented sufficiently for a privacy-reviewed projection."],
  "schema-review": ["Current schema or layout documentation and unsigned terms, with record rows omitted.", "A reviewer can identify all included fields, person-linked fields, keys, address/status semantics, and terms without registration or receipt of row data."],
  scope: ["Official source documentation defining the available product population and exclusions.", "The population represented by the product is precisely bounded and is not described as complete beyond documented evidence."],
  "source-scope": ["Official source documentation of legal-entity scope, included statuses/types, and known exclusions.", "The source's organization population and exclusions are explicit enough to assess fit; no unverified completeness claim is made."],
  "stable-identifier": ["Schema-only documentation of the publisher's organization identifier and uniqueness/stability guarantees.", "A persistent non-person identifier and uniqueness scope are documented across snapshots; names or addresses are not substituted as identity keys."],
  "stable-identifier-lifecycle": ["Official identifier lifecycle documentation for name changes, mergers, reinstatements, dissolution, and reuse.", "Lifecycle and identifier reuse behavior are documented sufficiently to avoid conflating distinct entities or historical states."],
  "status-codebook": ["Official status codebook with definitions, effective dates, and transition or historical semantics.", "Each status code maps to a documented publisher meaning and is retained as registration evidence only; no code alone is proof of current operation, licensure, solvency, or public access."],
  "platform-migration": ["Official legacy/replacement technical and rights transition package with cutover/dual-run dates, current and replacement layouts, identifier crosswalk, scope/status/address continuity, delivery and change controls, and post-cutover terms.", "An available edition and its authoritative route are identified; migration effects are explicitly reconciled or remain blocking. A future-system announcement or historic FTP agreement cannot establish post-cutover continuity. No subscription, credentials, transfer, or production change is authorized."],
});

const EXPECTED_STATES = AUTHORIZATION_PROGRAM_WAVES.flat();
const EXPECTED_GATES = Object.freeze(Object.keys(CONTRACTS).sort());
const PROHIBITED_ACTIONS = Object.freeze(["contact publisher or portal staff", "download or acquire source records or samples", "make payment, order, enroll, or accept terms", "request records or row-bearing preflight", "execute an acquisition connector or production change"]);

function fail(message) { throw new Error(`Broad-organization authorization program is invalid: ${message}`); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function jsonBytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
async function assertDataLocalDirectory(directory, { create = false } = {}) {
  const dataRoot = path.join(await realpath(APP_ROOT), "data");
  const resolved = path.resolve(directory);
  if (!isInside(dataRoot, resolved) || resolved === dataRoot) fail("output must be a child of canonical APP_ROOT/data");
  let current = path.dirname(dataRoot);
  for (const segment of path.relative(current, resolved).split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`linked or non-directory output ancestry: ${current}`);
  }
  return resolved;
}
function gateItem(state, gate) {
  const contract = CONTRACTS[gate];
  if (!contract) fail(`unknown assessment gate ${gate}`);
  if (gate === "large-acquisition-authorization") return {
    item_id: `${state.toLowerCase()}-${gate}`,
    gate_key: gate,
    gate_kind: "external-explicit-authorization",
    document_closable: false,
    automatic_closure_permitted: false,
    closure_requires: "Separate authenticated scope-specific user authorization for an exact reviewed proposal.",
    no_document_or_evidence_upload_can_close: true,
    publisher_document_is_user_approval: false,
    program_can_grant_authority: false,
    request_item: "Approval-only. This item is not a document evidence/upload request and grants no authority.",
    acceptance_criterion: contract[1],
    action_boundary: { ...NO_ACTION_BOUNDARY, prohibited_actions: [...PROHIBITED_ACTIONS] },
  };
  return {
    item_id: `${state.toLowerCase()}-${gate}`,
    gate_key: gate,
    gate_kind: "non-row-bearing-contract-evidence",
    document_closable: true,
    document_review_can_establish: "contract-evidence-sufficiency-only",
    automatic_closure_permitted: false,
    row_bearing: false,
    required_evidence_type: contract[0],
    acceptance_criterion: contract[1],
    grants_authority: false,
    action_boundary: { ...NO_ACTION_BOUNDARY, prohibited_actions: [...PROHIBITED_ACTIONS] },
  };
}

export function deriveBroadOrganizationAuthorizationProgram(backlog, backlogManifestBytes, backlogManifest) {
  if (backlog?.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID || backlog.states?.length !== 43
      || backlog.scope?.acquisition_authorized !== false || backlog.scope?.source_actions_performed !== 0) fail("backlog identity, scope, or authority boundary is invalid");
  if (JSON.stringify(backlog.states.map((row) => row.assessment?.state_abbreviation)) !== JSON.stringify(EXPECTED_STATES)
      || backlog.states.some((row, i) => row.priority !== i + 1 || row.first_wave !== (i < 10))) fail("backlog ordering or first-wave selection differs from the pinned contiguous waves");
  const gateKeys = [...new Set(backlog.states.flatMap((row) => row.assessment?.unresolved_gates ?? []))].sort();
  if (JSON.stringify(gateKeys) !== JSON.stringify(EXPECTED_GATES)) fail("backlog gate inventory differs from the exact 28-key contract");
  let gateCount = 0;
  const states = backlog.states.map(({ assessment }, index) => {
    if (!Array.isArray(assessment.unresolved_gates) || !Array.isArray(assessment.required_exclusions)) fail(`${assessment.state_abbreviation} lacks exact gates or privacy exclusions`);
    const wave = AUTHORIZATION_PROGRAM_WAVES.findIndex((codes) => codes.includes(assessment.state_abbreviation)) + 1;
    const items = assessment.unresolved_gates.map((gate) => gateItem(assessment.state_abbreviation, gate));
    gateCount += items.length;
    return {
      priority: index + 1,
      wave,
      state_abbreviation: assessment.state_abbreviation,
      state_name: assessment.state_name,
      unresolved_gates: [...assessment.unresolved_gates],
      gate_items: items,
      required_exclusions: structuredClone(assessment.required_exclusions),
      assessment_status_and_address_narrative: {
        decision: assessment.decision,
        candidate: structuredClone(assessment.candidate),
        current_coverage: structuredClone(assessment.current_coverage),
        observed_evidence: structuredClone(assessment.observed_evidence ?? []),
        strongest_bounded_next_action: assessment.strongest_bounded_next_action,
      },
      assessment_provenance: {
        assessment_id: assessment.assessment_id,
        assessment_kind: assessment.assessment_kind,
        observed_at: assessment.observed_at,
        coverage_release_id: assessment.coverage_release_id,
        official_urls: structuredClone(assessment.official_urls),
      },
      assessment_snapshot: structuredClone(assessment),
      authority: {
        acquisition_authorized: false,
        evidence_request_authorized: false,
        contact_authorized: false,
        download_authorized: false,
        payment_authorized: false,
        row_bearing_evidence_authorized: false,
        production_change_authorized: false,
      },
    };
  });
  if (gateCount !== 371) fail(`expected 371 gate items, found ${gateCount}`);
  return {
    schema_version: BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_SCHEMA_VERSION,
    dataset_id: BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,
    observed_at: backlog.observed_at,
    purpose: "Offline all-wave evidence and approval specification; not authorization or an instruction to acquire, contact, request, pay, or change production.",
    source_backlog: {
      dataset_id: backlogManifest.dataset_id,
      release_id: backlogManifest.release_id,
      manifest_sha256: sha256(backlogManifestBytes),
      artifact_path: backlogManifest.artifacts[0].path,
      artifact_bytes: backlogManifest.artifacts[0].bytes,
      artifact_sha256: backlogManifest.artifacts[0].sha256,
      assessment_catalog_id: backlogManifest.assessment_catalog_id,
      assessment_catalog_sha256: backlogManifest.assessment_catalog_sha256,
      first_wave_state_abbreviations: [...backlogManifest.first_wave_state_abbreviations],
    },
    wave_state_abbreviations: AUTHORIZATION_PROGRAM_WAVES.map((statesInWave) => [...statesInWave]),
    scope: {
      jurisdictions: 43,
      gate_items: gateCount,
      gate_key_count: EXPECTED_GATES.length,
      acquisition_authorized: false,
      evidence_request_authorized: false,
      source_actions_performed: 0,
      current_pointer_changed: false,
      no_contact_no_download_no_payment_no_record_request: true,
      action_boundary: { ...NO_ACTION_BOUNDARY, prohibited_actions: [...PROHIBITED_ACTIONS] },
    },
    states,
  };
}

export function buildBroadOrganizationAuthorizationProgramManifest(program) {
  const bytes = jsonBytes(program);
  const hash = sha256(bytes);
  const releaseId = `${BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID}-${program.observed_at}-${hash.slice(0, 12)}`;
  return {
    schema_version: "broad-organization-authorization-program-manifest@1.0.0",
    dataset_id: BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID,
    release_id: releaseId,
    status: "published",
    derived_only: true,
    source_actions_performed: 0,
    current_pointer_changed: false,
    source_backlog_release_id: program.source_backlog.release_id,
    source_backlog_manifest_sha256: program.source_backlog.manifest_sha256,
    source_backlog_artifact_sha256: program.source_backlog.artifact_sha256,
    state_count: 43,
    gate_item_count: program.scope.gate_items,
    gate_key_count: 28,
    wave_state_abbreviations: program.wave_state_abbreviations.map((wave) => [...wave]),
    artifacts: [{ path: "authorization-program.json", bytes: bytes.length, sha256: hash }],
  };
}

export async function buildBroadOrganizationAuthorizationProgram({ backlogManifestPath, outputRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_ROOT, signal } = {}) {
  if (!backlogManifestPath) fail("an exact verified backlog manifest path is required");
  const source = await verifyBroadOrganizationAcquisitionBacklog(backlogManifestPath);
  const canonicalSource = path.join(DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT, source.manifest.release_id, "manifest.json");
  if (path.resolve(backlogManifestPath) !== path.resolve(canonicalSource)) fail("backlog must be selected from its canonical immutable release");
  const backlogManifestBytes = await readFile(backlogManifestPath);
  const program = deriveBroadOrganizationAuthorizationProgram(source.backlog, backlogManifestBytes, source.manifest);
  const manifest = buildBroadOrganizationAuthorizationProgramManifest(program);
  const safeRoot = await assertDataLocalDirectory(outputRoot, { create: true });
  const releases = await assertDataLocalDirectory(path.join(safeRoot, "releases"), { create: true });
  const releaseDirectory = path.join(releases, manifest.release_id);
  try {
    const stat = await lstat(releaseDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail("pre-existing release identity is not a real directory");
    await verifyBroadOrganizationAuthorizationProgram(path.join(releaseDirectory, "manifest.json"));
    return { program, manifest, releaseDirectory, reused_existing_release: true };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const lock = path.join(releases, `.${manifest.release_id}.publish-lock`);
  await mkdir(lock);
  const staging = path.join(releases, `.${manifest.release_id}.staging-${randomUUID()}`);
  let ownsStaging = false;
  try {
    signal?.throwIfAborted();
    try { await lstat(releaseDirectory); fail("release identity already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await mkdir(staging);
    ownsStaging = true;
    await writeFile(path.join(staging, "authorization-program.json"), jsonBytes(program), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(staging, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    signal?.throwIfAborted();
    await verifyBroadOrganizationAuthorizationProgram(path.join(staging, "manifest.json"), { allowOwnedStaging: true });
    try { await lstat(releaseDirectory); fail("release identity appeared during publication"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(staging, releaseDirectory);
    ownsStaging = false;
    await verifyBroadOrganizationAuthorizationProgram(path.join(releaseDirectory, "manifest.json"));
  } finally {
    if (ownsStaging) await rm(staging, { recursive: true, force: true });
    await rmdir(lock);
  }
  return { program, manifest, releaseDirectory, reused_existing_release: false };
}

export async function verifyBroadOrganizationAuthorizationProgram(manifestPath, { allowOwnedStaging = false } = {}) {
  await assertDataLocalDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink !== 1) fail("manifest must be a singly linked regular file");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const keys = ["schema_version", "dataset_id", "release_id", "status", "derived_only", "source_actions_performed", "current_pointer_changed", "source_backlog_release_id", "source_backlog_manifest_sha256", "source_backlog_artifact_sha256", "state_count", "gate_item_count", "gate_key_count", "wave_state_abbreviations", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...keys].sort())) fail("manifest schema drifted");
  if (manifest.schema_version !== "broad-organization-authorization-program-manifest@1.0.0" || manifest.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PROGRAM_DATASET_ID
      || manifest.status !== "published" || manifest.derived_only !== true || manifest.source_actions_performed !== 0 || manifest.current_pointer_changed !== false) fail("manifest identity or authority boundary invalid");
  const directory = path.dirname(manifestPath);
  const dirStat = await lstat(directory);
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) fail("release directory must be a real directory");
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== 2 || entries.some((entry) => !["authorization-program.json", "manifest.json"].includes(entry.name) || !entry.isFile())) fail("release contains unexpected files or directories");
  const artifactPath = path.join(directory, "authorization-program.json");
  const artifactStat = await lstat(artifactPath);
  if (!artifactStat.isFile() || artifactStat.isSymbolicLink() || artifactStat.nlink !== 1) fail("program artifact must be a singly linked regular file");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 1 || manifest.artifacts[0].path !== "authorization-program.json") fail("artifact inventory drifted");
  const artifactBytes = await readFile(artifactPath);
  if (artifactBytes.length !== manifest.artifacts[0].bytes || sha256(artifactBytes) !== manifest.artifacts[0].sha256) fail("program artifact checksum mismatch");
  const program = JSON.parse(artifactBytes.toString("utf8"));
  const sourceId = program.source_backlog?.release_id;
  if (program.source_backlog?.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID || typeof sourceId !== "string") fail("source backlog identity invalid");
  const sourceManifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_PROGRAM_BACKLOG_RELEASES_ROOT, sourceId, "manifest.json");
  const sourceStat = await lstat(sourceManifestPath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || sourceStat.nlink !== 1) fail("source backlog manifest must be a singly linked regular file");
  const sourceBytes = await readFile(sourceManifestPath);
  if (sha256(sourceBytes) !== program.source_backlog.manifest_sha256) fail("source backlog manifest checksum mismatch");
  const source = await verifyBroadOrganizationAcquisitionBacklog(sourceManifestPath);
  const expected = deriveBroadOrganizationAuthorizationProgram(source.backlog, sourceBytes, source.manifest);
  const expectedManifest = buildBroadOrganizationAuthorizationProgramManifest(expected);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) fail("manifest differs from exact backlog-derived scope, waves, or authority boundary");
  if (!artifactBytes.equals(jsonBytes(expected)) || JSON.stringify(program) !== JSON.stringify(expected)) fail("program differs from exact verified backlog projection");
  if (source.manifest.artifacts[0].sha256 !== program.source_backlog.artifact_sha256) fail("source backlog artifact hash mismatch");
  const base = path.basename(directory);
  const staged = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(base);
  if (base !== manifest.release_id && !(allowOwnedStaging && staged)) fail("release directory identity mismatch");
  return { manifest, program };
}
