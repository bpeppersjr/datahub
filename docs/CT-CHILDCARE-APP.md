# Connecticut standalone collection handoff

Co*Tive owns CT childcare acquisition and normalization through the `state-ct-childcare-centers` source in the childcare industry. The fixed scope is the OEC dataset's literal ACTIVE Child Care Center rows. These are internal source candidates, not independently verified premises, unique active businesses or national completeness.

## Standalone operation

```powershell
node scripts/build-ct-childcare.mjs
node scripts/build-ct-childcare.mjs --acquired <absolute-retained-acquisition-manifest>
node scripts/verify-ct-childcare-app.mjs --receipt <absolute-app-receipt>
```

An optional `--output` folder stays inside datahub. The first command performs bounded native acquisition; the second independently verifies and reuses a completed acquisition without downloading it again. Verification is offline. No Codex or ChatGPT session is required for these app processes.

Fresh work has immutable UUID child outputs. The app persists start, acquired and normalized checkpoints before a terminal receipt. A successful receipt is independently replayed against both children, including the normalized manifest's acquired execution mode, path, hash and run identity. Native/injected children cannot be borrowed from another app job; retained reuse must be explicit and pinned. Recorded native mode is not independent network attestation.

The native worker uses a CT-wide publisher lock under `data/business-sources/ct-childcare/runtime` as well as output-root ownership. It does not steal unknown locks. Requests remain serial and provider-paced with the acquisition's response limits, a cooperative 30-minute app deadline and a 1 GB free-disk prerequisite. Managed child/supervisor cancellation grace is 60/75 seconds. More local RAM does not increase provider request rates.

Published acquisitions and normalized releases survive failure or cancellation for inspection and reuse. Child writers drain before ownership release. Unknown/partial publication or forced termination is not automatically resumed or retried. No recurring refresh schedule is enabled by this enrollment.

## Scope and reporting

Missing names and reported address values stay as candidate gaps. Repeated credentials are not merged. ZIP5 and ZIP4 remain separate; all coordinates are null because none are selected, and business polygons are not created. Source update, page observation and processing timestamps remain distinct. [Acquisition](CT-CHILDCARE-ACQUISITION.md) and [normalization](CT-CHILDCARE-NORMALIZATION.md) describe the evidence contracts.

Managed submission must explicitly select `industries: ["childcare"]`, `states: ["CT"]` and `sourceIds: ["state-ct-childcare-centers"]`. Omitting source selection is not the same bounded request. Enrollment and prerequisite-file presence are not proof of a dispatch, a completed download or national coverage. The state-access ledger keeps that distinction.

The actual handoff requires a managed operation ID and persisted receipt. After accepted dispatch, agents return to validation/development; ordinary download progress belongs to Co*Tive. No national production or source-current pointer changes are performed by this worker.

Rollback disables this industry entry and future worker use. Preserve app receipts, acquired data and normalized releases; do not delete retained evidence or repull merely to promote it.

## Accepted app handoff — September 8, 2026

After verification, the authenticated local plan returned exactly one task, `state-ct-childcare-centers:CT`, using the fixed CT worker and six CT prerequisite files. No other industry or state source was selected.

Co*Tive accepted the collection with HTTP 202 as operation `efd15ce2-6bba-4096-9084-7ace88ea0695`. Its response reported RUNNING; the immediately read durable receipt still recorded the initial QUEUED state at `data/managed-operations/efd15ce2-6bba-4096-9084-7ace88ea0695/receipt.json`. This proves accepted app handoff, not terminal success or a collected record count. No agent polling loop or recurring schedule was started. The app owns subsequent acquisition, normalization and operation-status updates.

Before dispatch, no retained acquisition/app manifests or ownership locks were found under the CT source storage root. This was a first collection, not a promotion repull. Existing CT business-registry data and all national production pins were left untouched.

## Verified application outcome — September 8, 2026

The accepted operation completed independently in Co*Tive. Managed receipt `efd15ce2-6bba-4096-9084-7ace88ea0695` is SUCCEEDED with completion `2026-09-08T18:24:05.121Z`; its industry task exited zero without forced termination. The industry log hash `0d07d157188f1bae27fdfe3acb66824e6f4b9f861281f17e741fa4341c5de3f5` matches the retained log, and its reported app receipt hash matches independent offline verification.

App job `0def40af-f6b8-4d48-aa0b-76408961cdc8` started at `2026-09-08T18:23:44.722Z` and finished at `2026-09-08T18:24:02.311Z`. Its receipt SHA-256 is `387fbe174b0ea69ab67e65ce5e209b5ba94267e19d4e710cb02e5ada79ce6f46`. Receipt path relative to datahub:

`data/industry-segments/runs/efd15ce2-6bba-4096-9084-7ace88ea0695/state-ct-childcare-centers-CT/jobs/0def40af-f6b8-4d48-aa0b-76408961cdc8/receipt.json`

The acquired job `7c67a938-74df-4df7-af75-13eb84cd11d4` has manifest SHA-256 `d50069a4b2a4812bf10006d96350d0f2db0373c7b77a0cfe76f6779907bea03c`. The normalized job `66100e56-2254-4e8a-9286-0d52193f17ee` has manifest SHA-256 `940bdcaafc39fc891f90723035f4746ddcdc7bed543d47ebb6636676b4aa2bb8`. Both sit under the app's corresponding `runs/<app-job>/acquired/jobs` and `runs/<app-job>/normalized/jobs` paths and can be reused without acquisition.

Acquisition used 13 serial requests and 1,190,259 decoded response bytes, completing at `2026-09-08T18:24:01.014Z`. Catalog source update remained `2026-09-07T08:15:33.000Z`, distinct from observation and processing. The native publisher and app output-owner locks were absent after completion.

Independent app verification replayed both retained children; a separate normalized-data audit also passed with network disabled. Observed quality:

| Measure | Verified retained source cohort |
|---|---:|
| Accepted source candidates | 1,390 |
| Quarantined source rows | 0 |
| Distinct ZIP5 values | 230 |
| Rows with valid ZIP5 syntax | 1,390 |
| Rows with separate ZIP4 | 1,208 |
| Missing reported street | 1 |
| Missing names/cities/states | 0 |
| Rows with coordinates | 0 |
| Distinct credential identifiers | 1,364 |
| Distinct license numbers | 1,362 |

All rows report CT. There are 21 repeated credential identifiers (26 additional rows) and 23 repeated license numbers (28 additional rows), with up to four rows per identifier. These repetitions must not be collapsed or counted as independently unique businesses. All four selected date fields passed floating-calendar validation, not operating-date verification. Maximum capacity parsed for all rows; under-three capacity was missing for five, while regular and school-age capacity were missing for all rows. Do not replace missing capacity with zero or sum repeated-credential rows into a purported unique-facility capacity total.

This outcome supersedes the earlier accepted-only status without changing its historical receipt evidence. No repull, recurring schedule or national promotion was performed during the audit. All 82 pending national production pins remained unchanged. Next: integrate verified local source-cohort reporting from these retained manifests, preserving the missing street, nullable coordinates and non-unique-business denominator.

## Implementation verification

Five focused app tests passed using synthetic transport, covering native publisher exclusion, durable child linkage, missing-address retention, explicit offline reuse, cancellation/checkpoints, mode/child forgery and CLI scope validation. Enrollment/ledger tests confirmed CT-only planning without fabricated measured coverage.

The full `npm run check` passed: 1,257 tests, 1,246 passed, 11 explicitly skipped and none failed. Lint, builds and desktop smoke passed. Type checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. Log: `data/tmp/ct-childcare-app-full-check.log`. These checks plus accepted dispatch do not prove collection completion or national completeness; terminal receipt verification and later reporting remain separate work.
