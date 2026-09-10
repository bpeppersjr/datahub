# Maryland retained county relationships

This offline successor adds county relationships for the 1,772 retained Maryland center candidates to the existing Pennsylvania-only derivative. It does not acquire records, change production pointers, enroll a map layer, infer ZIP membership, or establish verified premises/current operations. ZIP5 and ZIP4 remain separate. Non-Maryland relationships are preserved exactly.

The separate `md-childcare-county-derivation-internal@1.0.0` policy governs only this processing step. The historical Maryland acquisition policy and PA-only v1 implementation remain unchanged. Authorization replays the fixed native acquisition receipt and normalized release, exact prerequisite artifact, both complete retained item metadata observations, and pinned Census/registry evidence. Original item notices and Maryland attribution are retained. Parsed item payloads are replayed; this is not a claim that raw HTTP bodies were retained.

The production loader accepts only cancellation, not caller-supplied records, policies, paths or transports. It verifies all 12,206 candidates and the 3,235 Census county boundaries plus state identifiers. Maryland reported state is compared through Census postal-abbreviation-to-FIPS mappings. Unknown labels remain unresolved; cross-state results require review; ambiguous boundaries remain unassigned. Iowa points retain unknown CRS rather than borrowing map defaults.

## Publication and recovery

The CLI is `node scripts/build-retained-childcare-county-relations-v2.mjs --run`. It stages a new UUID-scoped manifest, replays the complete fixed-input calculation and policy authorization before linking, then rechecks staged bytes/hash and directory ownership. Publication uses an exclusive hard link; existing manifests are never overwritten. The ordinary inspector independently reconstructs the report again.

Cancellation before publication removes only ownership-verified staging. Other pre-publication failures preserve staging for inspection. After publication, cancellation or failed inspection reports the manifest path, run ID, expected SHA-256 and `published-inspection-required`; this does not authorize a retry. Cancellation immediately after linking can leave both hard-linked names, which the ordinary inspector deliberately rejects until an explicit recovery resolves staging. Do not delete retained evidence or rerun simply because inspection was interrupted.

Synthetic sequencing tests cover binding failure before publication, cancellation before and after publication, inspection failure/redacted recovery identity, and success ordering. They use no production artifacts and are not evidence of native publication. Native policy replay is separately gated by `DATAHUB_TEST_RETAINED_COUNTY_MANIFEST`; native successor inspection uses `DATAHUB_TEST_RETAINED_COUNTY_V2_MANIFEST`.

No UI enrollment or national promotion is included. Rollback removes the new implementation/policy from future use while preserving original source evidence and any published derivative.

## Native internal build — September 10, 2026

Run `b660d059-25c4-44fc-8c4a-b94bc87d855e` published and independently replayed its manifest under `data/retained-childcare-county-relations`. SHA-256: `be0798c546d0016d7633c563f73e62734358cd0a8dd0025c28e35a0cdc3298ee`. The native CLI exited successfully after post-publication inspection.

The native-enabled successor suite then passed all three tests, including another independent replay of that published manifest and exact PA/MD totals. The native-enabled policy suite passed all three tests. TypeScript checks passed and the production dependency audit reported zero vulnerabilities. Full repository checks remain separate from these focused results.

Of 12,206 candidates, 6,702 have single-county relationships: 4,930 Pennsylvania and 1,772 Maryland. Maryland covers all 24 county equivalents; Pennsylvania has positive counts in 66 counties. The remaining 4,028 have no source point and 1,476 Iowa candidates have unknown CRS. There are no invalid, outside-polygon or ambiguous results in this particular retained cohort. These are source-record relationships, not distinct active-business counts or national industry completeness percentages. Source requests: zero. The PA-only predecessor, historical source policy, map enrollment and production pointers remain unchanged.

The next map change must aggregate source cohort and assigned geography separately. Reusing the combined assigned total as Pennsylvania's state total would be incorrect. Supported empty counties may be zero; unsupported states/counties, ZIP level, geography mismatch and unavailable evidence must remain null. Source-specific share denominators must be labeled explicitly and never presented as all-U.S. industry completeness.

## Release validation

`npm run check` passed: 1,829 total tests, 1,817 passed, 12 skipped, zero failures, followed by successful lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/md-county-successor-full-check.log`. The new native v2 test was skipped in that broad run because it started before publication completed; its separate native-enabled run subsequently passed all three tests against the published manifest. Native policy replay was enabled in the full run. TypeScript and zero-vulnerability production dependency audit also passed. Independent read-only review found no remaining publication blocker. No browser visual QA was performed because no UI changed.
