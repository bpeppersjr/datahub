import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { APP_ROOT } from "./paths.mjs";
import { loadBroadOrganizationCurrentAuthorizationChainManagementView } from "./broad-organization-current-authorization-chain-view.mjs";

const STATUS = "PROPOSED — NOT APPROVED — NO ACTION AUTHORIZED";
const SUPERSEDED_WAVE_1_SHA256 = "976369982eea4c8289acb4677a921ede6cd0fe7efacf8e0fa5de6c8afd3c2a50";
const PROPOSALS = Object.freeze([
  Object.freeze({ wave: 1, sha256: "895aecf8e1220d3772972a5e5c843bcd46a4887068df28f966268b60d2ec109b", states: Object.freeze([["IL", "Illinois"], ["MS", "Mississippi"], ["AR", "Arkansas"], ["KY", "Kentucky"], ["HI", "Hawaii"], ["KS", "Kansas"], ["NV", "Nevada"], ["UT", "Utah"], ["WA", "Washington"], ["OK", "Oklahoma"]]) }),
  Object.freeze({ wave: 2, sha256: "7af64202446dec8e328a3955cd572b6dacd94863e6797dbbe1ee4498731701dc", states: Object.freeze([["AL", "Alabama"], ["AZ", "Arizona"], ["CA", "California"], ["GA", "Georgia"], ["ID", "Idaho"], ["IN", "Indiana"], ["LA", "Louisiana"], ["MA", "Massachusetts"], ["MD", "Maryland"], ["ME", "Maine"]]) }),
  Object.freeze({ wave: 3, sha256: "7309b02db317db8667f2c9cc146f002a7d1f8935e6b1db18bab339f824e9dc18", states: Object.freeze([["MI", "Michigan"], ["MN", "Minnesota"], ["MO", "Missouri"], ["MT", "Montana"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["OH", "Ohio"]]) }),
  Object.freeze({ wave: 4, sha256: "b18ceb51b2c2aadf912587b12ea121a6ab1c4180c4a49db0478946a4b652a9f6", states: Object.freeze([["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["VA", "Virginia"], ["VT", "Vermont"], ["WI", "Wisconsin"], ["WV", "West Virginia"], ["WY", "Wyoming"], ["NE", "Nebraska"]]) }),
]);

const filename = (wave) => `WAVE-${wave}-DOCUMENT-ONLY-INQUIRY-20260923-01.md`;
const proposalId = (wave) => `wave-${wave}-document-only-inquiry-20260923-01`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fail(message) { throw new Error(`Document-only inquiry proposal registry unavailable: ${message}`); }

export async function loadDocumentOnlyInquiryProposalRegistryView(docsOverride, loadCurrentChain = loadBroadOrganizationCurrentAuthorizationChainManagementView) {
  const root = await realpath(APP_ROOT);
  const docs = docsOverride === undefined ? path.join(root, "docs") : path.resolve(docsOverride);
  const stat = await lstat(docs);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(docs) !== docs) fail("canonical documentation directory is unavailable");
  const matching = (await readdir(docs, { withFileTypes: true }))
    .filter((entry) => /^WAVE-\d+-DOCUMENT-ONLY-INQUIRY-20260923-01\.md$/.test(entry.name));
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
    if (!text.includes(`Status: **${STATUS}**`) || !text.includes(`Proposal ID: \`${id}\``) || !text.includes(`Approve ${id} with document SHA-256 <exact-sha256>.`)) fail(`wave ${expected.wave} identity, status, or approval syntax is invalid`);
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
  const chain = await loadCurrentChain();
  const chainStates = chain?.states;
  const chainMetadata = chain?.metadata;
  if (chain?.schema_version !== "broad-organization-current-authorization-chain-management-view@1.0.0" || chain?.available !== true || !Array.isArray(chainStates) || !chainMetadata || typeof chainMetadata.jurisdiction_count !== "number" || typeof chainMetadata.current_gap_state_count !== "number" || typeof chainMetadata.broad_data_coverage?.admitted_jurisdictions !== "number" || typeof chainMetadata.broad_data_coverage?.current_data_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.expected_current_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.packeted_current_gaps !== "number" || typeof chainMetadata.authorization_packet_coverage?.authorization_packet_gaps !== "number") fail("verified current authorization chain has an invalid projection");
  const authoritativeStates = new Set();
  for (const state of chainStates) {
    const code = state?.state_abbreviation;
    if (typeof code !== "string" || !/^[A-Z]{2}$/.test(code) || authoritativeStates.has(code)) fail("verified current authorization chain state roster is invalid");
    authoritativeStates.add(code);
  }
  if (authoritativeStates.size !== chainMetadata.current_gap_state_count || seen.size !== authoritativeStates.size || [...seen].some((code) => !authoritativeStates.has(code)) || [...authoritativeStates].some((code) => !seen.has(code))) fail("proposal roster does not exactly match verified current-gap states");
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
