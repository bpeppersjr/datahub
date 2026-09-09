# Iowa retained publisher-cohort reporting

The offline reporter verifies the app receipt, acquired selection and normalized release before deriving counts. It rereads those bindings before returning. It makes no source requests and does not repull data for promotion.

Run `node scripts/report-ia-childcare.mjs` for the pinned installed enrollment, or pass `--receipt ABSOLUTE_RECEIPT` to inspect a retained app job. The explicit receipt path preserves its execution mode; enrollment requires the pinned native mode. Missing enrollment is not-enrolled; a missing enrolled receipt is unavailable, never measured zero. Invalid or changed evidence fails verification.

The installed collection contains 3,201 mixed-source rows, 1,476 selected center/preschool rows, 1,725 excluded rows, zero selected duplicates and zero quarantined rows. All accepted rows have a validated five-digit source ZIP and a source point; there are 404 distinct ZIP5 values. ZIP4 remains a separate null field. Point accuracy, address role, current operations, source update time and reported address state remain unknown.

The original response observation is `2026-09-09T02:14:36.039Z`; processing time is separately preserved. Enrollment pins app receipt SHA-256 `949da3f49aa4e7e8469114ce926a9cdd82762c66c8156afde8f77865f7f799ec` and transitively verifies the acquired and normalized manifests.

ZIP percentages use accepted retained publisher-cohort rows as the denominator, not unique active businesses or nationwide industry completeness. Rows are attributed to the Iowa publisher, not inferred Iowa address-state membership. Duplicates and quarantined rows remain accountable; excluded provider classes do not enter the denominator.

The state-access ledger exposes Iowa childcare `localPublisherCohortEvidence`. National evidence status, totals and dispatch remain separate. This increment does not implement heatmap UI integration, national promotion, public export, recurring refreshes or new acquisition.

Reporting and enrollment tests cover offline execution, installed native evidence, duplicate/quarantine conservation, unknown fields, cancellation, tampering, invalid paths and redacted CLI errors. The ledger regression verifies unavailable local enrollment does not change other cells or national totals.

Release verification: `data/tmp/ia-reporting-full-check.log` records a successful `npm run check`: 1,494 tests, 1,483 passed, 11 skipped, zero failures, followed by successful lint, web/desktop builds and desktop control-plane smoke. Installed Iowa reporting and app-owned PDF runtime tests were enabled. TypeScript passed and `npm audit --omit=dev` found zero vulnerabilities. Forty focused tests passed separately. Comparing state-access reports `20260909021744-a9c63220-965b-403a-9311-eeb673ab0b6c` and `20260909022508-bba514bf-2dec-4778-a5c3-3911d184c858` verified only Iowa local publisher-cohort evidence changed; the national summary and all other cells were unchanged.

Rollback: remove the Iowa reporting enrollment configuration to disable the local projection. Preserve retained data and app receipts; removing reporting enrollment does not require downloading again.

## Next integration boundary

A source-separated retained-cohort comparison can consume the PA, CT, MD, VT, CO, UT and IA reporting enrollments without source acquisition. Keep reported-address state distinct from publisher-only scope (VT and IA). Aggregate summaries support cohort comparisons; business-name drilldowns require separately verified normalized-row access.

This presentation work must not modify national release pointers or claim national completeness. The current national registry enumerates different enrolled adapters, and its production builders/verifiers are pinned by the previously denied Ohio production plan. Adding sources to national production requires a separately reviewed and authorized production change; do not alter or relaunch that denied plan to implement the comparison layer.
