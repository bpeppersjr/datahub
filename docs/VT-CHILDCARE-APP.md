# Vermont standalone collection

Co*Tive's `state-vt-childcare-centers` industry source runs bounded acquisition and offline normalization as an application job. Its fixed scope is licensed CBCCPP and CBCCPP - Non-Recurring source candidates, not all childcare programs or independently verified current businesses.

```powershell
node scripts/build-vt-childcare.mjs
node scripts/build-vt-childcare.mjs --acquired <absolute-retained-acquisition-manifest>
node scripts/verify-vt-childcare-app.mjs --receipt <absolute-app-receipt>
```

The first command selects native collection; the second independently verifies and reuses retained acquisition without source requests. Optional `--output` stays inside datahub. Successful completion binds verified acquired and normalized releases through immutable start, child checkpoint and terminal receipts. Test transport remains distinct from native mode; recorded native mode is not independent network attestation.

Native jobs hold publisher-wide ownership at `data/business-sources/vt-childcare/runtime/publisher.lock`, across output roots, until writers drain and terminal persistence finishes. Unknown ownership is not stolen. Retained and injected-test jobs do not take this native publisher lock. Workspace ownership separately prevents overlapping writes.

The app requires one billion observed free disk bytes and has a cooperative 30-minute deadline. Acquisition retains its 135-request/150-million-byte caps, 500-row POST pages, serial pacing, 30-second request deadline and 15-minute acquisition deadline. Managed source/supervisor cancellation grace is 60/75 seconds. These are safeguards, not resource reservations or permission to exceed provider rates.

Completed child releases survive failed or cancelled control outcomes. Native/test jobs cannot borrow another job's children; retained mode pins an explicitly selected acquisition. Terminal publication is last. Uncertain outputs require inspection, not automatic retry. No automatic restart or recurring refresh is enabled merely by industry enrollment.

## Managed handoff

Use the authenticated local plan and collection endpoints with exact selectors:

```json
{"industries":["childcare"],"states":["VT"],"sourceIds":["state-vt-childcare-centers"]}
```

The plan must resolve to one Vermont task and six prerequisite configurations. An accepted operation ID and persisted managed receipt establish handoff; configuration entries alone do not prove a download occurred. After dispatch, Co*Tive owns routine acquisition and processing, and agents return to source validation or development rather than polling download progress.

See [normalization boundaries](VT-CHILDCARE-NORMALIZATION.md) for separate postal fields, null points, unknown reporting period, unverified address role, raw dates/capacities and row conservation. New local artifacts do not automatically enter national reporting or replace production source pins. Rollback disables this industry entry for future jobs while preserving receipts and releases.

## Verification

Focused tests passed 47/47 across normalization, normalized publication, app lifecycle, industry enrollment, registry loading and management security. Coverage includes 501-row conservation with redacted oversized-row quarantine, postal splitting and raw lineage, changed child evidence, source-mode borrowing, native publisher exclusion with synthetic transport, retained reuse without source requests, commit-boundary cancellation and uncertain publication. These are synthetic implementation checks, not an acquired Vermont release or accepted app handoff.

The first full run exposed an omitted explicit state-ledger profile mapping for the new industry source. The mapping now marks Vermont as unmeasured rather than manufacturing published coverage; all 26 state-ledger tests, including a new Vermont boundary regression, passed. The ledger does not inspect actual app dispatch, so its enrollment status is not a substitute for an operation receipt. The initial full-run log remains at `data/tmp/vt-childcare-app-full-check.log`.

The corrected full `npm run check` passed: 1,332 tests, 1,321 passed, 11 skipped, zero failures, plus lint, web/desktop builds and desktop control-plane smoke. Evidence: `data/tmp/vt-childcare-app-full-check-2.log`. Type checking passed, production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. The idle development app was restored after verification; no production launch was attempted.

## Accepted application handoff — September 8, 2026

Implementation `85416bb` was pushed before dispatch. The authenticated plan resolved exactly one Vermont task with six prerequisites. No retained Vermont acquisition or managed Vermont source folder was found before this first collection; only the earlier metadata preflight existed.

At `2026-09-08T21:03:38.452Z`, the collection API accepted operation `52b06724-fa4e-4873-9388-27c1a5f1424d` with HTTP 202 and API status RUNNING. The immediate persisted managed receipt at `data/managed-operations/52b06724-fa4e-4873-9388-27c1a5f1424d/receipt.json` still showed its QUEUED transition and supervisor PID 5108. Its handoff-time SHA-256 was `6c92ff37fb52108bd949c5e00cbd442977babe72f037138f1f6261a569f232b0`; this evolving control receipt is not a terminal artifact pin. The persisted plan was checked for the exact Vermont source and state.

Co*Tive owns acquisition and normalization after acceptance. No agent download-progress polling or recurring refresh was started. This records handoff, not completed collection, verified row counts, reporting integration or national promotion. Keep the application service running; automatic restart is not provided by this enrollment.

## Verified retained completion — September 8, 2026

A subsequent downstream-readiness check found managed operation `52b06724-fa4e-4873-9388-27c1a5f1424d` terminal SUCCEEDED. The standalone app receipt records start `2026-09-08T21:03:38.605Z` and finish `2026-09-08T21:04:05.091Z`, with execution mode `fixed-native-fetch`. No collection was resubmitted. Offline verification succeeded using:

```powershell
node scripts/verify-vt-childcare-app.mjs --receipt 'C:\Master Data\datahub\data\industry-segments\runs\52b06724-fa4e-4873-9388-27c1a5f1424d\state-vt-childcare-centers-VT\jobs\4f721905-454e-4f16-b11f-98594d035640\receipt.json'
```

The verifier checks the app checkpoints and child bindings, replays retained acquisition evidence and recomputes normalization, including artifact contents and hashes. It does not independently attest the network execution or publisher authenticity.

| Retained artifact | Run ID | SHA-256 |
| --- | --- | --- |
| Terminal app receipt | `4f721905-454e-4f16-b11f-98594d035640` | `7b82339cffcafd56569561d82c004e1184e8fe4daf943fed0ed38c7bc794f485` |
| Acquired manifest | `c56ad1bb-a80d-4612-b7f5-f97f0a4037e0` | `2af5a986fd2036b4cede77dc0ec70026059ca195e0033e69b33482f107d8fdae` |
| Normalized manifest | `b6fda9fd-718e-4c99-abcd-a51fbbf1bf92` | `76db6d145ed227f5bca80281d2727a1953d1df59a724a602c11b115467c1c166` |

The verified summary conserves 503 selected source rows as 503 normalized candidates and zero quarantined rows. All 503 have syntactically accepted ZIP5 values; a separate local aggregation found 172 distinct reported ZIP5 values. Two records retain a separate ZIP4. All 503 lack a source-reported state and selected coordinates; the Vermont publisher scope is not silently substituted for address state. ZIP syntax acceptance does not prove USPS assignment or ZCTA membership. Dates and capacities parsed without unavailable-value counts, but neither current operations nor the exact reporting period is verified.

These are internal source candidates, not a count of distinct active businesses or a national coverage percentage. National reporting integration and public export remain false. The next integration step must consume these retained, verified manifests, keep publisher scope distinct from reported geography, and preserve the missing-geocode/current-status gaps. No new source download is required for that step.

### Retained reporting integration boundary

A parallel review of Maryland's enrollment and the state-access ledger identified a required Vermont distinction: do not project `by_reported_state` onto VT, which would yield a misleading zero or require inventing state assignments. Add separately labeled local publisher-cohort evidence, with `publisherJurisdiction: VT`, null reported address state, 503 publisher-cohort rows and 503 missing-address-state rows. Preserve the null-state aggregation bucket and source clocks without decoding a reporting period from the filename. A native receipt enrollment must pin and reverify the retained chain; missing artifacts mean unavailable, not zero. ZIP metrics must distinguish distinct reported values from rows and must not imply polygon assignment. Acceptance tests must cover null-state conservation, publisher-only placement, missing enrollment, injected-mode rejection, tampering and unchanged national ledger counts. This is the reviewed next implementation contract, not an implemented reporting feature.

Completion-evidence validation: `npm run check` passed again (1,332 tests; 1,321 passed, 11 skipped, zero failed; lint, builds and desktop smoke passed), with log `data/tmp/vt-retained-completion-check.log`. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending production pins remained unchanged. Both app queues were confirmed empty before the temporary development-service stop required for desktop verification; the service was restored afterward. This change records retained evidence and the reporting boundary only; it does not add runtime behavior or alter production data.
