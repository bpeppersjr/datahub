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

## Verification

Five focused app tests passed using synthetic transport, covering native publisher exclusion, durable child linkage, missing-address retention, explicit offline reuse, cancellation/checkpoints, mode/child forgery and CLI scope validation. Enrollment/ledger tests confirmed CT-only planning without fabricated measured coverage.

The full `npm run check` passed: 1,257 tests, 1,246 passed, 11 explicitly skipped and none failed. Lint, builds and desktop smoke passed. Type checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins remained unchanged. Log: `data/tmp/ct-childcare-app-full-check.log`. These checks plus accepted dispatch do not prove collection completion or national completeness; terminal receipt verification and later reporting remain separate work.
