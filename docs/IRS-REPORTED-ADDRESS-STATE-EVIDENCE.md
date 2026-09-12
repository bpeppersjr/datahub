# IRS reported-address state evidence

The app now reuses the already published IRS EO BMF `derived/source-summary.json` for reported filing-address state evidence. No new acquisition, normalization, snapshot or production rebuild is needed. National pointers, registry/coverage manifests, source artifacts and physical-site profile counts are unchanged.

## Selected evidence, not the latest pointer

The bounded reader follows the selected coverage pointer and manifest, checks its source-view artifact, follows the registry manifest dependency hash, then the registry's IRS dependency hash and the IRS summary artifact hash/size. It does not consult the IRS current pointer. It rejects duplicate dependencies/artifacts, unknown schema versions, unsafe paths or aliases, malformed counts, stale cached coverage manifests, mismatched source lineage/dates/totals, and hash drift. All chain files and the selection are rechecked after reading. Failure leaves IRS state evidence unmeasured; national availability alone cannot establish state representation.

Selected IRS release: `irs-eo-bmf-20260903-003447217Z-565da6cd`; manifest SHA-256 `999233d73e42eac72a094d1248d6790680d39d276c3a9e849a496d01ed5288f8`. Summary: `derived/source-summary.json`, 1,604 bytes, SHA-256 `7e637daedf25769a534711b5642202e0acde881c238b4b0dbcb69b914b45a6a2`. Source release: `irs-eo-bmf-2026-08-11-d272cdb9c6c4afef`; posting date `2026-08-11`, observed `2026-09-03T00:34:47.217Z`.

## Meaning and denominators

The source has 1,955,841 accepted organization filing-address records across 56 states/territories. Of these, 1,952,433 report one of the 50 states or D.C.; 3,408 report territories. The original 1,957,340 source rows also include 1,498 excluded outside the supported U.S. scope and one quarantined row; neither enters accepted state counts.

The UI's denominator remains six configured nationwide datasets, not organization or business counts. All 50 states and D.C. now have evidence from 6/6 configured datasets. This is dataset presence, not all-business completeness, which remains unknown. IRS records are labelled `organization filing-address records`, with evidence kind `organization-filing-address` and no location `profileId`. Other datasets retain their separate location-profile evidence. Filing/headquarters address state is not a verified physical operating site, current-operation claim, ZIP polygon assignment or county membership. No ZIP-derived state inference is used. No percentage of the 56-jurisdiction IRS record population is displayed.

Example counts: Illinois 74,541; Minnesota 40,094; Oklahoma 22,343; New Hampshire 9,481; D.C. 14,126. Source posting and observation dates are visible alongside IRS state evidence.

## Verification evidence

The IRS verifier now validates each normalized record's supported reported filing-address state and exact address role, and independently reconciles the complete state map against the saved source summary. Summary accepted/excluded/quarantine/region totals must conserve the source count. Rehashed shifted counts, unknown states, false address roles, negative counts, unknown fields and changed totals are covered by tests.

The strengthened verifier ran once over this native release and passed. Command: `node scripts/verify-irs-eo-bmf.mjs data/business-sources/irs-eo-bmf-organizations/releases/irs-eo-bmf-20260903-003447217Z-565da6cd/manifest.json`. Log: `data/ui-verification/irs-state-summary-native-verifier.log`. An earlier CLI invocation used an unsupported flag and failed before opening the source; it did not replay records. Request-time readers only rehash the small pinned chain and summary and report `sourceReplayPerformedThisRead: false`; they never scan the millions of normalized rows.

Focused tests: 17 passed, zero failures/skips. TypeScript passed; production dependency audit found zero vulnerabilities. After `stop-collector.bat`, the desktop UI verified Illinois's filing count, 6/6 dataset presence, source date and physical-site/unknown-completeness caveats at 200% text. Panel client/scroll width: 1,180px, with no horizontal overflow. Screenshot: `data/ui-verification/irs-state-representation-200.png`; text reset to 100% afterward.

Frozen full-check command: `$env:DATAHUB_TEST_RESTRICTED_SAMPLES='1'; npm run check`, logged at `data/ui-verification/irs-state-summary-full-check.log`. Final result and relaunch evidence are supplied in the release handoff after completion. Native/private opt-ins other than the already verified restricted-sample integration are not enabled.

Rollback removes this read-only adapter/integration while preserving all source artifacts and pins; IRS would return to unmeasured in this panel, not be marked absent nationally. The dedicated coding/testing implementation used supported Astra fallback after Spark failed to respond. Sites guidance preserved the existing app and local-only delivery; no hosted deployment or dependencies were added.
