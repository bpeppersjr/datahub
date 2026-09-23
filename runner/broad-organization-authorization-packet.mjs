import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID,
  DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT,
  verifyBroadOrganizationAcquisitionBacklog,
} from "./broad-organization-acquisition-backlog.mjs";
import { APP_ROOT } from "./paths.mjs";

export const BROAD_ORGANIZATION_AUTHORIZATION_PACKET_SCHEMA_VERSION = "1.0.0";
export const BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID = "broad-organization-authorization-packet";
export const DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT = path.join(APP_ROOT, "data", BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID);
export const DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT = path.join(DEFAULT_BROAD_ORGANIZATION_ACQUISITION_BACKLOG_ROOT, "releases");

const NO_ACTION_BOUNDARY = Object.freeze({
  contact_authorized: false,
  contact_performed: false,
  download_authorized: false,
  download_performed: false,
  payment_authorized: false,
  payment_performed: false,
  record_request_authorized: false,
  records_requested: 0,
  row_bearing_evidence_authorized: false,
  production_change_authorized: false,
  no_contact: true,
  no_download: true,
  no_payment: true,
  no_record_request: true,
});

const PROHIBITED_ACTIONS = Object.freeze([
  "contact publisher or portal staff",
  "download or acquire source records or samples",
  "make payment, order, enroll, or accept terms",
  "request records or row-bearing preflight",
  "execute an acquisition connector or production change",
]);

const GATE_CONTRACTS = Object.freeze({
  "address-role": ["Official field dictionary or schema-only documentation identifying each address role and ZIP field.", "Every retained address role is explicitly classified as administrative, mailing, registered, principal, or other; unknown and person-linked roles are excluded, and ZIP5/ZIP+4 handling is specified."],
  automation: ["Published or already-held written documentation of the officially supported automated access method, limits, authentication, and permitted use.", "The publisher documents an approved repeatable access path and limits without scraping, search enumeration, or circumventing controls; any needed permission remains separately ungranted."],
  "automation-boundary": ["Written description of allowed and prohibited automation for the identified product, including rate and authentication requirements.", "Permitted operations are explicit and compatible with a reviewed bounded connector; prohibited scraping, browser automation, and access-control bypass remain excluded."],
  "bulk-route": ["Official product page or written product specification identifying a current complete organization-level bulk route, exact population scope, exclusions, delivery mode, and control totals; metadata only.", "A current complete organization-level extract and its bounded delivery route are documented without accessing records; search/login access, filing access, statutory availability, or an unbounded portal is not accepted as bulk-delivery evidence."],
  "change-contract": ["Schema-only documentation describing full snapshots, deltas, deletions, corrections, replay, cadence, timestamps, and checksums.", "A repeatable reconciliation contract identifies inserts, updates, deletions, replay behavior, observation time, and integrity controls; unresolved semantics remain explicit."],
  "current-bulk-scope": ["Current official documentation defining bulk-export population, included entity classes, exclusions, and control counts.", "The intended complete legal-entity population and material exclusions are documented with a publisher control total or an explicit statement that no control total exists."],
  "eligible-address-role": ["Official schema-only field dictionary distinguishing organization addresses from agent, officer, owner, and residential addresses.", "A deterministic allowlist identifies organization-level administrative address roles; personal, agent, residential, and ambiguous roles are excluded."],
  "entity-type-scope": ["Official product scope statement enumerating domestic, foreign, active, inactive, and entity-type coverage.", "Included entity types and statuses are enumerated and reconcile to the intended organization scope; unsupported classes are not implied covered."],
  "exact-scope": ["Official product specification of exact extract scope, exclusions, counts, and delivery cadence.", "The product population, exclusions, and expected snapshot scope are unambiguous and support a bounded organization-only projection."],
  "full-export-terms": ["Current non-row-bearing product specification, versioned schema or empty layout, aggregate control totals, unsigned commercial terms, and rights terms for the uncapped full export.", "The complete intended population, fields, exclusions, control total, exact price and obligations, retention, transformation, derived publication, and redistribution rights are all explicit; capped, split, truncated, sampled, purchased, enrolled, or accepted-term access is not authorized by this packet."],
  "large-acquisition-authorization": ["Separate written, scope-specific authorization for the stated acquisition size, cadence, and delivery method.", "An accountable authority explicitly approves the named acquisition scope and method; this packet itself grants no acquisition or row-bearing authority."],
  "migration-continuity": ["Official migration or transition notice identifying the current and replacement products, post-cutover availability, authoritative delivery route, layout compatibility, identifier crosswalk, and continuity rules.", "An actually available current edition and delivery path are documented with cutover, layout, and identifier continuity handled explicitly; superseded catalogs and historical inventory are not treated as proof of current availability."],
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
  "status-codebook": ["Official status codebook with definitions, effective dates, and transition or historical semantics.", "Each status code maps to a documented publisher meaning and is retained as registration evidence only; no code alone is treated as proof of current operation."],
});

function fail(message) {
  throw new Error(`Broad-organization authorization packet is invalid: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function canonicalDataRoot() {
  return path.join(await realpath(APP_ROOT), "data");
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function assertDataLocalDirectory(directory, { create = false } = {}) {
  const dataRoot = await canonicalDataRoot();
  const resolved = path.resolve(directory);
  if (!isInside(dataRoot, resolved) || resolved === dataRoot) fail("output must be a child of canonical APP_ROOT/data");
  const appRoot = path.dirname(dataRoot);
  const segments = path.relative(appRoot, resolved).split(path.sep);
  if (segments[0] !== "data") fail("output is not under canonical APP_ROOT/data");
  let current = appRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT" || !create) throw error;
      await mkdir(current);
      stat = await lstat(current);
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`linked or non-directory output ancestry is not allowed: ${current}`);
  }
  return resolved;
}

function makeRequestItem(stateAbbreviation, gate) {
  const contract = GATE_CONTRACTS[gate];
  if (!contract) fail(`unmapped assessment gate: ${gate}`);
  return {
    request_item_id: `${stateAbbreviation.toLowerCase()}-${gate}`,
    unresolved_gate: gate,
    request_item_type: "non-row-bearing-evidence-specification",
    row_bearing: false,
    request_item: `Obtain or review non-row-bearing evidence for ${gate}; this is a packet specification only and is not an instruction to contact or request anything now.`,
    required_evidence_type: contract[0],
    acceptance_criterion: contract[1],
    action_boundary: {
      ...NO_ACTION_BOUNDARY,
      prohibited_actions: [...PROHIBITED_ACTIONS],
      no_contact_no_download_no_payment_no_record_request: true,
    },
  };
}

export function deriveBroadOrganizationAuthorizationPacket(backlog, backlogManifestBytes, backlogManifest) {
  if (backlog?.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID
      || backlog?.states?.length !== 43
      || backlog?.scope?.first_wave_size !== 10
      || backlog?.scope?.acquisition_authorized !== false) fail("verified backlog identity or authority boundary is invalid");
  const firstWave = backlog.states.filter((row) => row.first_wave === true);
  const stateCodes = firstWave.map((row) => row.assessment?.state_abbreviation);
  if (firstWave.length !== 10 || JSON.stringify(stateCodes) !== JSON.stringify(backlog.scope.first_wave_state_abbreviations)
      || JSON.stringify(stateCodes) !== JSON.stringify(backlogManifest.first_wave_state_abbreviations)) fail("backlog first-wave selection does not match its manifest");
  const states = firstWave.map(({ assessment }) => {
    if (!Array.isArray(assessment.unresolved_gates) || !Array.isArray(assessment.required_exclusions)) fail(`${assessment.state_abbreviation} lacks gates or privacy exclusions`);
    return {
      state_abbreviation: assessment.state_abbreviation,
      state_name: assessment.state_name,
      assessment_provenance: {
        assessment_id: assessment.assessment_id,
        assessment_kind: assessment.assessment_kind,
        observed_at: assessment.observed_at,
        coverage_release_id: assessment.coverage_release_id,
      },
      publisher: assessment.candidate?.publisher,
      product: assessment.candidate?.product,
      access: assessment.candidate?.availability,
      price: assessment.candidate?.price,
      official_urls: structuredClone(assessment.official_urls),
      authorization_flags: {
        bounded_connector_implementation_authorized: assessment.bounded_connector_implementation_authorized,
        autonomous_acquisition_authorized: assessment.autonomous_acquisition_authorized,
        paid_acquisition_authorized: assessment.paid_acquisition_authorized,
        complete_source_acquisition_authorized: assessment.complete_source_acquisition_authorized,
        row_bearing_preflight_authorized: assessment.row_bearing_preflight_authorized,
        broad_layer_production_ready: assessment.broad_layer_production_ready,
      },
      unresolved_gates: [...assessment.unresolved_gates],
      request_items: assessment.unresolved_gates.map((gate) => makeRequestItem(assessment.state_abbreviation, gate)),
      privacy_exclusions: structuredClone(assessment.required_exclusions),
      legal_status_limitations: assessment.status_semantics
        ? [assessment.status_semantics, "Preserve publisher-defined status categories; status or registration evidence alone is not proof of current operation, licensure, solvency, or public access."]
        : [...(assessment.observed_evidence ?? []).filter((item) => /status|active|inactive|registration|operation/i.test(item)), "Preserve publisher-defined status categories; status or registration evidence alone is not proof of current operation, licensure, solvency, or public access."],
      address_limitations: assessment.address_zip
        ? [assessment.address_zip, "Reported registration, administrative, principal, or mailing address is not verified operating premises or a physical site."]
        : [...(assessment.observed_evidence ?? []).filter((item) => /address|zip|premises|location/i.test(item)), "Reported registration, administrative, principal, or mailing address is not verified operating premises or a physical site."],
      assessment_evidence_and_limitations: structuredClone(assessment.observed_evidence ?? []),
      strongest_bounded_next_action: assessment.strongest_bounded_next_action,
      assessment_snapshot: structuredClone(assessment),
      no_external_action_performed: true,
    };
  });
  return {
    schema_version: BROAD_ORGANIZATION_AUTHORIZATION_PACKET_SCHEMA_VERSION,
    dataset_id: BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID,
    observed_at: backlog.observed_at,
    purpose: "Offline authorization-packet specification for future review; not an authorization, source request, acquisition, or production instruction.",
    source_backlog: {
      dataset_id: backlogManifest.dataset_id,
      release_id: backlogManifest.release_id,
      manifest_sha256: sha256(backlogManifestBytes),
      artifact_path: backlogManifest.artifacts[0].path,
      artifact_bytes: backlogManifest.artifacts[0].bytes,
      artifact_sha256: backlogManifest.artifacts[0].sha256,
      assessment_catalog_id: backlogManifest.assessment_catalog_id,
      assessment_catalog_sha256: backlogManifest.assessment_catalog_sha256,
      first_wave_state_abbreviations: [...stateCodes],
    },
    scope: {
      jurisdictions: 10,
      request_items: states.reduce((count, state) => count + state.request_items.length, 0),
      acquisition_authorized: false,
      contact_authorized: false,
      row_bearing_evidence_authorized: false,
      source_actions_performed: 0,
      current_pointer_changed: false,
      no_contact_no_download_no_payment_no_record_request: true,
      action_boundary: {
        ...NO_ACTION_BOUNDARY,
        prohibited_actions: [...PROHIBITED_ACTIONS],
      },
    },
    states,
  };
}

export function buildBroadOrganizationAuthorizationPacketManifest(packet) {
  const bytes = jsonBytes(packet);
  const packetHash = sha256(bytes);
  const releaseId = `${BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID}-${packet.observed_at}-${packetHash.slice(0, 12)}`;
  return {
    schema_version: "broad-organization-authorization-packet-manifest@1.0.0",
    dataset_id: BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID,
    release_id: releaseId,
    status: "published",
    derived_only: true,
    source_actions_performed: 0,
    current_pointer_changed: false,
    source_backlog_release_id: packet.source_backlog.release_id,
    source_backlog_manifest_sha256: packet.source_backlog.manifest_sha256,
    source_backlog_artifact_sha256: packet.source_backlog.artifact_sha256,
    state_count: 10,
    request_item_count: packet.scope.request_items,
    first_wave_state_abbreviations: [...packet.source_backlog.first_wave_state_abbreviations],
    artifacts: [{ path: "authorization-packet.json", bytes: bytes.length, sha256: packetHash }],
  };
}

export async function buildBroadOrganizationAuthorizationPacket({
  backlogManifestPath,
  outputRoot = DEFAULT_BROAD_ORGANIZATION_AUTHORIZATION_PACKET_ROOT,
  signal,
} = {}) {
  if (!backlogManifestPath) fail("an exact verified backlog manifest path is required");
  const source = await verifyBroadOrganizationAcquisitionBacklog(backlogManifestPath);
  const expectedSourcePath = path.join(DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT, source.manifest.release_id, "manifest.json");
  if (path.resolve(backlogManifestPath) !== path.resolve(expectedSourcePath)) fail("source backlog manifest must be selected from its canonical immutable release directory");
  const backlogManifestBytes = await readFile(backlogManifestPath);
  const packet = deriveBroadOrganizationAuthorizationPacket(source.backlog, backlogManifestBytes, source.manifest);
  const manifest = buildBroadOrganizationAuthorizationPacketManifest(packet);
  const safeOutputRoot = await assertDataLocalDirectory(outputRoot, { create: true });
  const releasesDirectory = await assertDataLocalDirectory(path.join(safeOutputRoot, "releases"), { create: true });
  const releaseDirectory = path.join(releasesDirectory, manifest.release_id);
  try {
    const existing = await lstat(releaseDirectory);
    if (!existing.isDirectory() || existing.isSymbolicLink()) fail("pre-existing release identity is not a real directory");
    await verifyBroadOrganizationAuthorizationPacket(path.join(releaseDirectory, "manifest.json"));
    return { packet, manifest, releaseDirectory, reused_existing_release: true };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const lockDirectory = path.join(releasesDirectory, `.${manifest.release_id}.publish-lock`);
  await mkdir(lockDirectory);
  const stagingDirectory = path.join(releasesDirectory, `.${manifest.release_id}.staging-${randomUUID()}`);
  let ownsStaging = false;
  try {
    let releaseExists = false;
    try {
      const existing = await lstat(releaseDirectory);
      if (!existing.isDirectory() || existing.isSymbolicLink()) fail("release identity appeared as a linked or non-directory path");
      releaseExists = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (releaseExists) {
      await verifyBroadOrganizationAuthorizationPacket(path.join(releaseDirectory, "manifest.json"));
      return { packet, manifest, releaseDirectory, reused_existing_release: true };
    }
    await mkdir(stagingDirectory);
    ownsStaging = true;
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "authorization-packet.json"), jsonBytes(packet), { flag: "wx" });
    signal?.throwIfAborted();
    await writeFile(path.join(stagingDirectory, "manifest.json"), jsonBytes(manifest), { flag: "wx" });
    signal?.throwIfAborted();
    await verifyBroadOrganizationAuthorizationPacket(path.join(stagingDirectory, "manifest.json"), { allowOwnedStaging: true });
    try {
      await lstat(releaseDirectory);
      fail("release identity appeared during publication; refusing to replace it");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(stagingDirectory, releaseDirectory);
    ownsStaging = false;
  } finally {
    if (ownsStaging) await rm(stagingDirectory, { recursive: true, force: true });
    await rmdir(lockDirectory);
  }
  return { packet, manifest, releaseDirectory, reused_existing_release: false };
}

export async function verifyBroadOrganizationAuthorizationPacket(manifestPath, { allowOwnedStaging = false } = {}) {
  await assertDataLocalDirectory(path.dirname(manifestPath));
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail("manifest must be a regular file");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const expectedKeys = ["schema_version", "dataset_id", "release_id", "status", "derived_only", "source_actions_performed", "current_pointer_changed", "source_backlog_release_id", "source_backlog_manifest_sha256", "source_backlog_artifact_sha256", "state_count", "request_item_count", "first_wave_state_abbreviations", "artifacts"];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify([...expectedKeys].sort())) fail("manifest schema drifted");
  if (manifest.schema_version !== "broad-organization-authorization-packet-manifest@1.0.0"
      || manifest.dataset_id !== BROAD_ORGANIZATION_AUTHORIZATION_PACKET_DATASET_ID
      || manifest.status !== "published" || manifest.derived_only !== true
      || manifest.source_actions_performed !== 0 || manifest.current_pointer_changed !== false) fail("manifest identity or authority boundary is invalid");
  const releaseDirectory = path.dirname(manifestPath);
  const releaseStat = await lstat(releaseDirectory);
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink()) fail("release directory must be real");
  const entries = await readdir(releaseDirectory, { withFileTypes: true });
  if (entries.length !== 2 || entries.some((entry) => !["authorization-packet.json", "manifest.json"].includes(entry.name) || !entry.isFile())) fail("release contains unexpected files or directories");
  const packetPath = path.join(releaseDirectory, "authorization-packet.json");
  const packetStat = await lstat(packetPath);
  if (!packetStat.isFile() || packetStat.isSymbolicLink()) fail("packet artifact must be a regular file");
  if (manifest.artifacts.length !== 1 || manifest.artifacts[0].path !== "authorization-packet.json") fail("manifest artifact inventory drifted");
  const packetBytes = await readFile(packetPath);
  if (packetBytes.length !== manifest.artifacts[0].bytes || sha256(packetBytes) !== manifest.artifacts[0].sha256) fail("packet artifact checksum mismatch");
  const packet = JSON.parse(packetBytes.toString("utf8"));
  if (packet.source_backlog.dataset_id !== BROAD_ORGANIZATION_ACQUISITION_BACKLOG_DATASET_ID
      || !/^broad-organization-acquisition-backlog-20\d{2}-\d{2}-\d{2}-[0-9a-f]{12}$/.test(packet.source_backlog.release_id ?? "")) fail("packet references an unsupported backlog release");
  const sourceManifestPath = path.join(DEFAULT_BROAD_ORGANIZATION_BACKLOG_RELEASES_ROOT, packet.source_backlog.release_id, "manifest.json");
  const sourceManifestStat = await lstat(sourceManifestPath);
  if (!sourceManifestStat.isFile() || sourceManifestStat.isSymbolicLink()) fail("source backlog manifest must be a regular file");
  const sourceManifestBytes = await readFile(sourceManifestPath);
  if (sha256(sourceManifestBytes) !== packet.source_backlog.manifest_sha256) fail("source backlog manifest lineage checksum mismatch");
  const source = await verifyBroadOrganizationAcquisitionBacklog(sourceManifestPath);
  if (source.manifest.artifacts[0].sha256 !== packet.source_backlog.artifact_sha256) fail("source backlog artifact lineage checksum mismatch");
  const expectedPacket = deriveBroadOrganizationAuthorizationPacket(source.backlog, sourceManifestBytes, source.manifest);
  const expectedManifest = buildBroadOrganizationAuthorizationPacketManifest(expectedPacket);
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) fail("manifest differs from the exact verified backlog-derived packet projection or authority boundary");
  if (!packetBytes.equals(jsonBytes(expectedPacket)) || JSON.stringify(packet) !== JSON.stringify(expectedPacket)) fail("packet differs from the exact verified backlog-derived projection");
  const directoryName = path.basename(releaseDirectory);
  const stagedName = new RegExp(`^\\.${manifest.release_id}\\.staging-[0-9a-f-]{36}$`, "i").test(directoryName);
  if (directoryName !== manifest.release_id && !(allowOwnedStaging && stagedName)) fail("release directory identity mismatch");
  return { manifest, packet };
}
