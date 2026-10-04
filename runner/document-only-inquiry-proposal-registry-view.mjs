import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { loadBroadOrganizationCurrentAuthorizationChainManagementView } from "./broad-organization-current-authorization-chain-view.mjs";
import { loadBroadOrganizationAuthorizationProgramManagementView } from "./broad-organization-authorization-program-view.mjs";

const STATUS = "PROPOSED — NOT APPROVED — NO ACTION AUTHORIZED";
const SUPERSEDED_WAVE_1_SHA256 = "895aecf8e1220d3772972a5e5c843bcd46a4887068df28f966268b60d2ec109b";
const PROPOSALS = Object.freeze([
  Object.freeze({ wave: 1, sha256: "8c6bc9c5d69469edf6dafddf616a208956580df62aea59a09f50e775944ed48a", states: Object.freeze([["CA", "California"], ["ID", "Idaho"], ["IL", "Illinois"], ["OH", "Ohio"], ["KY", "Kentucky"], ["NC", "North Carolina"], ["NH", "New Hampshire"], ["OK", "Oklahoma"], ["HI", "Hawaii"], ["MA", "Massachusetts"]]) }),
  Object.freeze({ wave: 2, sha256: "8ce9b3a1b3d835915652d92da4d75ba48491c3568a6036b926c99441d5dc8c3e", states: Object.freeze([["MD", "Maryland"], ["ME", "Maine"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["ND", "North Dakota"], ["NJ", "New Jersey"], ["NV", "Nevada"], ["SC", "South Carolina"], ["TN", "Tennessee"]]) }),
  Object.freeze({ wave: 3, sha256: "156a26c0e1b7ef7bbf58ad73b8c18695bc56fee0ddc63f6f0b2334d5022511b5", states: Object.freeze([["VA", "Virginia"], ["VT", "Vermont"], ["WI", "Wisconsin"], ["WV", "West Virginia"], ["AZ", "Arizona"], ["IN", "Indiana"], ["KS", "Kansas"], ["LA", "Louisiana"], ["MO", "Missouri"], ["MT", "Montana"]]) }),
  Object.freeze({ wave: 4, sha256: "fe4bee251fcd2d21fc8b562f2ffff9a5b42fd0d3453299cefdcc5f8fc8a15dbb", states: Object.freeze([["RI", "Rhode Island"], ["SD", "South Dakota"], ["WY", "Wyoming"], ["AL", "Alabama"], ["AR", "Arkansas"], ["GA", "Georgia"], ["NE", "Nebraska"], ["NM", "New Mexico"], ["UT", "Utah"], ["WA", "Washington"]]) }),
]);

const filename = (wave) => `WAVE-${wave}-DOCUMENT-ONLY-INQUIRY-20261003-02.md`;
const proposalId = (wave) => `wave-${wave}-document-only-inquiry-20261003-02`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fail(message) { throw new Error(`Document-only inquiry proposal registry unavailable: ${message}`); }

export async function loadDocumentOnlyInquiryProposalRegistryView(
  docsOverride,
  loadCurrentProgram = loadBroadOrganizationAuthorizationProgramManagementView,
  loadCurrentChain = loadBroadOrganizationCurrentAuthorizationChainManagementView,
) {
  const root = await realpath(APP_ROOT);
  const docs = docsOverride === undefined ? path.join(root, "docs") : path.resolve(docsOverride);
  const stat = await lstat(docs);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(docs) !== docs) fail("canonical documentation directory is unavailable");
  const matching = (await readdir(docs, { withFileTypes: true }))
    .filter((entry) => /^WAVE-\d+-DOCUMENT-ONLY-INQUIRY-20261003-02\.md$/.test(entry.name));
  if (matching.length !== 4 || matching.some((entry) => !entry.isFile() || entry.isSymbolicLink())) fail("expected exactly four regular proposal documents");
  const seen = new Set();
  const proposals = [];
  for (const expected of PROPOSALS) {
    const name = filename(expected.wave);
    if (!matching.some((entry) => entry.name === name)) fail(`wave ${expected.wave} document is missing`);
    const file = path.join(docs, name);
    const fileStat = await lstat(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || await realpath(file) !== file) fail(`wave ${expected.wave} document is not canonical`);
    const bytes = await readFile(file);
    const digest = sha256(bytes);
    if (digest !== expected.sha256) fail(`wave ${expected.wave} document hash does not match its governed proposal`);
    const text = bytes.toString("utf8");
    const id = proposalId(expected.wave);
    const expectedStateCodes = expected.states.map(([code]) => code);
    const stateCodeLine = `- Program wave roster: \`${expectedStateCodes.join(", ")}\``;
    if (!text.includes(`Status: **${STATUS}**`) || !text.includes(`Proposal ID: \`${id}\``)
        || !text.includes(stateCodeLine) || !text.includes(`Approve ${id} with document SHA-256 <exact-sha256>.`)) fail(`wave ${expected.wave} identity, status, roster, or approval syntax is invalid`);
    for (const [code, nameValue] of expected.states) {
      if (seen.has(code) || !text.includes(nameValue)) fail(`wave ${expected.wave} roster is missing or duplicated`);
      seen.add(code);
    }
    proposals.push({
      proposal_id: id,
      wave_number: expected.wave,
      status: "PROPOSED",
      approval_status: "NOT APPROVED",
      authority_status: "NO ACTION AUTHORIZED",
      document_sha256: digest,
      state_count: expected.states.length,
      states: expected.states.map(([state_abbreviation, state_name]) => ({ state_abbreviation, state_name })),
      approval_syntax: `Approve ${id} with document SHA-256 ${digest}.`,
      supersession: expected.wave === 1 ? {
        supersedes_only_prior_unapproved_document_sha256: SUPERSEDED_WAVE_1_SHA256,
        prior_proposal_was_approved: false,
        prior_proposal_authorized_action: false,
      } : null,
    });
  }
  const program = await loadCurrentProgram();
  const chain = await loadCurrentChain();
  const chainStates = chain?.states;
  const chainMetadata = chain?.metadata;
  const programStates = program?.states;
  const programMetadata = program?.metadata;
  const lineage = program?.source_lineage;
  const expectedWaves = PROPOSALS.map((proposal) => proposal.states.map(([code]) => code));
  const programSchemaSupported = ["broad-organization-authorization-program-management-view@2.0.0", "broad-organization-authorization-program-management-view@3.0.0"].includes(program?.schema_version);
  const readinessValid = program?.schema_version !== "broad-organization-authorization-program-management-view@3.0.0"
    || (program?.metadata?.gate_readiness?.taxonomy_version === "1.0.0"
      && program.metadata.gate_readiness.distinct_keys_classified === 121
      && program.metadata.gate_readiness.taxonomy_exhaustive === true
      && program.metadata.gate_readiness.unresolved_gate_item_count === 371
      && program.metadata.gate_readiness.readiness_uplift === false);
  if (!programSchemaSupported || !readinessValid || program?.available !== true
      || !Array.isArray(programStates) || programStates.length !== 40 || !programMetadata || programMetadata.jurisdiction_count !== 40
      || JSON.stringify(programMetadata.wave_state_abbreviations) !== JSON.stringify(expectedWaves)
      || !lineage || !/^broad-organization-acquisition-backlog-/.test(lineage.backlog_release_id ?? "")
      || !/^broad-organization-authorization-program-/.test(programMetadata.release_id ?? "")
      || !/^[a-f0-9]{64}$/.test(lineage.program_manifest_sha256 ?? "") || !/^[a-f0-9]{64}$/.test(lineage.program_artifact_sha256 ?? "")
      || !programMetadata.release_id.endsWith(lineage.program_artifact_sha256.slice(0, 12))
      || !/^[a-f0-9]{64}$/.test(lineage.backlog_manifest_sha256 ?? "") || !/^[a-f0-9]{64}$/.test(lineage.backlog_artifact_sha256 ?? "")
      || !lineage.backlog_release_id.endsWith(lineage.backlog_artifact_sha256.slice(0, 12))
      || !/^[a-f0-9]{64}$/.test(lineage.assessment_catalog_sha256 ?? "") || !lineage.assessment_catalog_id
      || !program.authority || Object.values(program.authority).some((value) => value !== false && value !== 0)) fail("verified current authorization program or lineage is invalid");
  const programWaveStates = expectedWaves.map((_, index) => programStates.filter((state) => state.wave === index + 1).map((state) => state.state_abbreviation));
  if (JSON.stringify(programWaveStates) !== JSON.stringify(expectedWaves)) fail("verified authorization program state roster differs from its four waves");
  const diagnostic = chain?.diagnostic_batch;
  if (chain?.schema_version !== "broad-organization-current-authorization-chain-management-view@1.1.0" || chain?.available !== true || !Array.isArray(chainStates) || !chainMetadata || typeof chainMetadata.jurisdiction_count !== "number" || typeof chainMetadata.current_gap_state_count !== "number" || typeof chainMetadata.broad_data_coverage?.admitted_jurisdictions !== "number" || typeof chainMetadata.broad_data_coverage?.current_data_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.expected_current_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.packeted_current_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.authorization_packet_gaps !== "number" || diagnostic?.kind !== "weakest-comparable-diagnostic-profile-batch" || diagnostic?.selection_count !== 10 || diagnostic?.comparable_gap_count !== 31 || diagnostic?.unavailable_gap_count !== 9 || !Array.isArray(diagnostic?.states) || diagnostic.states.length !== 10 || diagnostic?.authority?.status !== "HOLD" || Object.entries(diagnostic.authority).some(([key, value]) => key !== "status" && value !== false)) fail("verified current authorization chain has an invalid projection");
  const authoritativeStates = new Set();
  for (const state of chainStates) {
    const code = state?.state_abbreviation;
    if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code) || authoritativeStates.has(code)) fail("verified current authorization chain state roster is invalid");
    authoritativeStates.add(code);
  }
  if (authoritativeStates.size !== chainMetadata.current_gap_state_count || seen.size !== authoritativeStates.size || [...seen].some((code) => !authoritativeStates.has(code)) || [...authoritativeStates].some((code) => !seen.has(code))
      || JSON.stringify(programStates.map((state) => state.state_abbreviation).sort()) !== JSON.stringify([...authoritativeStates].sort())) fail("proposal roster does not exactly match verified current-gap states");
  const lineageLines = [
    `- Assessment catalog: \`${lineage.assessment_catalog_id}\` (SHA-256 \`${lineage.assessment_catalog_sha256}\`)`,
    `- Backlog release: \`${lineage.backlog_release_id}\``,
    `- Backlog manifest SHA-256: \`${lineage.backlog_manifest_sha256}\``,
    `- Backlog artifact SHA-256: \`${lineage.backlog_artifact_sha256}\``,
    `- Authorization program release: \`${programMetadata.release_id}\``,
    `- Program manifest SHA-256: \`${lineage.program_manifest_sha256}\``,
    `- Program artifact SHA-256: \`${lineage.program_artifact_sha256}\``,
  ];
  for (const proposal of PROPOSALS) {
    const text = await readFile(path.join(docs, filename(proposal.wave)), "utf8");
    if (lineageLines.some((line) => !text.includes(line))) fail(`wave ${proposal.wave} document is not bound to the verified current backlog and program lineage`);
  }
  return {
    schema_version: "document-only-inquiry-proposal-registry-view@1.0.0",
    available: true,
    coverage: {
      actual_collected_data: { admitted_jurisdictions: chainMetadata.broad_data_coverage.admitted_jurisdictions, denominator: chainMetadata.jurisdiction_count, unresolved_data_gaps: chainMetadata.broad_data_coverage.current_data_gaps },
      authorization_packets: { covered_current_gap_states: chainMetadata.authorization_packet_coverage.packeted_current_gaps, expected_current_gap_states: chainMetadata.authorization_packet_coverage.expected_current_gaps, packet_gaps: chainMetadata.authorization_packet_coverage.authorization_packet_gaps },
      document_only_proposals: { covered_current_gap_states: seen.size, expected_current_gap_states: authoritativeStates.size, proposal_gaps: authoritativeStates.size - seen.size },
    },
    authority: {
      approval_granted: false,
      action_authorized: false,
      contact_authorized: false,
      browsing_authorized: false,
      download_authorized: false,
      payment_authorized: false,
      enrollment_authorized: false,
      automation_authorized: false,
      connector_authorized: false,
      production_authorized: false,
      pointer_change_authorized: false,
    },
    proposals,
  };
}
