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
