import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { loadBroadOrganizationCurrentAuthorizationChainManagementView } from "./broad-organization-current-authorization-chain-view.mjs";
import { loadBroadOrganizationAuthorizationProgramManagementView } from "./broad-organization-authorization-program-view.mjs";

const STATUS = "PROPOSED — NOT APPROVED — NO ACTION AUTHORIZED";
const SUPERSEDED_WAVE_1_SHA256 = "895aecf8e1220d3772972a5e5c843bcd46a4887068df28f966268b60d2ec109b";
const PROPOSAL_LINEAGE_LINES = Object.freeze([
  "- Assessment catalog: `state-business-source-assessment-catalog-51-2026-10-03` (SHA-256 `2657cf08d39c61bb5c02a37dec778447c420002c01e91c223cd75847e26f5a1d`)",
  "- Backlog release: `broad-organization-acquisition-backlog-2026-10-07T05-23-37.982Z-add02eecfa37`",
  "- Backlog manifest SHA-256: `ba710a3fdbe108fac26527e94951191e052d1359ce47a1d6c4f9b579ce60163b`",
  "- Backlog artifact SHA-256: `add02eecfa37f3abef25686ae9965a4b6eb018b281943fa7315600be38343cab`",
  "- Authorization program release: `broad-organization-authorization-program-2026-10-07T05-23-37.982Z-0187d2cedbe7`",
  "- Program manifest SHA-256: `7c9be7223cdd5a73d6bf093475efaadee548b8a95d79f929e99198e85bcb3890`",
  "- Program artifact SHA-256: `0187d2cedbe7c47ea1ad54d533b71a2eeaee5ffba84cfdce2a9b1a777bed8ab8`",
]);
const PROPOSALS = Object.freeze([
  Object.freeze({ wave: 1, sha256: "16606c61044a20f515527bd657df578e87dcd7a3d12ae61b4ecce7592978cb92", states: Object.freeze([["CA", "California"], ["ID", "Idaho"], ["IL", "Illinois"], ["OH", "Ohio"], ["KY", "Kentucky"], ["NC", "North Carolina"], ["NH", "New Hampshire"], ["OK", "Oklahoma"], ["HI", "Hawaii"], ["MA", "Massachusetts"]]) }),
  Object.freeze({ wave: 2, sha256: "e32f6a48a2baa46fecaf327b9b1694e4f5b6c1bfb06cd94fc5249bf121466f61", states: Object.freeze([["MD", "Maryland"], ["ME", "Maine"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["ND", "North Dakota"], ["NJ", "New Jersey"], ["NV", "Nevada"], ["SC", "South Carolina"], ["TN", "Tennessee"]]) }),
  Object.freeze({ wave: 3, sha256: "a5726ffed679f33f679eb15f034b469b26008d1d215c88649ff888a85a13b232", states: Object.freeze([["VA", "Virginia"], ["VT", "Vermont"], ["WI", "Wisconsin"], ["WV", "West Virginia"], ["AZ", "Arizona"], ["IN", "Indiana"], ["KS", "Kansas"], ["LA", "Louisiana"], ["MO", "Missouri"], ["MT", "Montana"]]) }),
  Object.freeze({ wave: 4, sha256: "e3d7519785d133c57c9f33a0ac2eac5c5e36f6b6945f338544aee57eb8719728", states: Object.freeze([["RI", "Rhode Island"], ["SD", "South Dakota"], ["WY", "Wyoming"], ["AL", "Alabama"], ["AR", "Arkansas"], ["GA", "Georgia"], ["NE", "Nebraska"], ["NM", "New Mexico"], ["UT", "Utah"], ["WA", "Washington"]]) }),
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
  for (const proposal of PROPOSALS) {
    const text = await readFile(path.join(docs, filename(proposal.wave)), "utf8");
    if (PROPOSAL_LINEAGE_LINES.some((line) => !text.includes(line))) fail(`wave ${proposal.wave} document is not bound to its governed proposal lineage`);
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
