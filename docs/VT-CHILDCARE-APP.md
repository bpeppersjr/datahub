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
