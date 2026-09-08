# Colorado standalone childcare processing

Co*Tive's fixed Colorado app worker combines bounded source acquisition with [offline normalization](CO-CHILDCARE-NORMALIZATION.md). It runs independently of Codex or ChatGPT. Source requests retain the existing limits: one request at a time, at least one second between requests, bounded pages/bodies/counts, paired preflights and reconciled baseline/selected/final IDs. Available RAM does not change publisher pacing.

## Local execution and reuse

```powershell
node scripts/build-co-childcare.mjs --help
node scripts/build-co-childcare.mjs --output data/business-sources/co-childcare/app
node scripts/build-co-childcare.mjs --acquired <absolute-verified-acquired-manifest> --output data/business-sources/co-childcare/reprocessed-app
node scripts/verify-co-childcare-app.mjs --receipt <absolute-app-receipt>
```

Omitting `--acquired` selects native collection; providing it selects offline reuse. Do not run native collection merely to promote or reprocess existing data. Verification makes no source requests. Native app jobs share a publisher lock across output roots; unknown locks require inspection and are never stolen. Synthetic injected transports are test-only and do not attest a live provider response.

The app persists a start record, verified acquisition and normalization checkpoints, then a terminal receipt. Successful verification checks mode, ownership, hashes, chronology and the exact child-release bindings. Failure or cancellation preserves published children and an inspection-required terminal outcome; it does not schedule a retry. A cooperative 30-minute deadline and existing supervisor cancellation apply. OS stalls or forced termination remain recovery cases, not proof of clean cancellation.

## Managed industry handoff

The existing collection API can select only `state-co-childcare-centers`, industry `childcare`, state `CO`. Other states and industries remain separate tasks. Enrollment alone is not a completed handoff: the app must accept an operation and persist its receipt. After that receipt is checked, the app owns acquisition; no agent slot or Codex download-polling loop is needed.

This connector adds no recurring refresh schedule, automatic retry, national source-pointer change or national promotion. Category membership and application-reported addresses do not prove operating status, unique business identity or exact geocodes. Rollback disables future Colorado dispatch while retaining immutable historical receipts and releases.

## Implementation verification — September 8, 2026

The final full `npm run check` passed: 1,369 tests, 1,358 passed, 11 skipped and zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Type checking passed and the production dependency audit reported zero vulnerabilities. All 82 pending production pins remained unchanged. Log: `data/tmp/co-childcare-app-full-check.log`.

Focused coverage includes four normalizer groups, two normalized-release groups, five app lifecycle groups and 28 state-ledger tests. Retained CLI execution is tested without source transport; native-entry tests substitute a synthetic global transport and do not claim live acquisition. An initial focused run overlapped a normalization semantic edit and failed cross-process replay; the frozen final implementation passed its focused rerun and full suite. Review corrected category-versus-operating-status semantics and a stale configuration artifact label before final verification.

No retained Colorado facility release or managed Colorado source folder was found before handoff preparation; only the earlier bounded preflight existed. Actual dispatch is recorded separately below when accepted, not inferred from these tests.

## Accepted application handoff — September 8, 2026

Implementation `9bf11ea` was pushed before dispatch. The authenticated live plan selected exactly one `state-co-childcare-centers` task for CO with all seven prerequisites. At `2026-09-08T22:33:23.366Z`, the app accepted operation `7b75574d-cdda-4262-9932-e7639e965204` with HTTP 202 and API status RUNNING.

The immediate persisted receipt, `data/managed-operations/7b75574d-cdda-4262-9932-e7639e965204/receipt.json`, still reflected QUEUED with supervisor PID 14972. Its handoff-time SHA-256 was `15fac41af60ecc9b07841aa461c989ce1e7aa3462f53f001e8b930b0b5301a64`; this evolving control receipt is not a terminal artifact pin. The persisted plan independently matched the exact source and state. A preliminary local command failed at JavaScript parsing before any request; it created no operation. Only the successful submission was sent.

Co*Tive now owns acquisition and normalization. No agent download polling, recurring schedule or national production launch was started. Accepted handoff is not terminal success, measured rows or national coverage. Keep the app service running. A subsequent downstream-readiness audit must inspect its terminal receipts and reuse the verified retained release rather than resubmitting collection.

## Verified retained completion — September 8, 2026

A downstream-readiness audit found managed operation `7b75574d-cdda-4262-9932-e7639e965204` terminal SUCCEEDED at `2026-09-08T22:34:00.745Z`. The child app completed at `2026-09-08T22:33:57.531Z`. Independent offline chain verification passed twice, with source access disabled in the aggregate audits. No collection was resubmitted.

| Retained artifact | Run ID | SHA-256 |
| --- | --- | --- |
| App receipt | `589c0868-a338-4a2d-a42f-ba93841620fc` | `fa2310b5c6aab0734abe743559d99b4e221ebce12bb679d0c01c25d0396d378f` |
| Acquired manifest | `2d96fc62-8e64-4cab-bf11-f0f8d2c308ee` | `ae828a8d5cfe4904dbe2cfca4932ef97f2b6ca1edc8c9c47d551b9032c89a146` |
| Normalized manifest | `a40bcdaf-42b2-4f77-a944-6a44f491909b` | `1002e00d83cb65dae82e3225a373581d05cf43774cdb0c87fd538180558e302b` |

All 1,648 source candidates normalized, with zero quarantine and all reported states CO. There are 321 distinct reported ZIP5 values and three separate ZIP4 values. Points and operating status are unavailable for every row; one capacity value is missing. This is not a verified count of active businesses or assigned geographic coverage. [Local reporting](CO-CHILDCARE-REPORTING.md) consumes the retained artifacts without repulling and keeps national completeness unmeasured.
