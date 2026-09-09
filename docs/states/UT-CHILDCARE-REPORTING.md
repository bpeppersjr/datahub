# Utah retained local candidate reporting

Utah reporting reuses the completed Co*Tive adoption receipt and its unchanged normalized release. It makes no publisher requests, creates no business polygons and does not advance national production pointers.

## Evidence and denominators

The enrolled receipt is `data/industry-segments/runs/c82c25f1-4dcc-4a68-aebe-fd91d81cefe0/state-ut-childcare-centers-retained-UT/jobs/e62e5abb-52f9-4cb7-8984-4917de926293/receipt.json`, SHA-256 `79e3303235bbcf04dc366cc4b85c7c22de5b05a896f8d5f910bbd8d17424e190`. Its execution mode is `retained-local-adoption`, not historical native acquisition. Reporting verifies this receipt and the complete retained semantic chain before projecting records, then verifies retained integrity again before returning.

State and ZIP5 buckets count accepted source-candidate rows. Their percentage denominator is the selected center cohort, not the report's mixed-program total or all Utah/U.S. businesses. ZIP4 remains separate and is not a grouping key. Reported address state is source evidence, not polygon membership or independently verified USPS assignment.

The original observation timestamp remains separate from normalized processing and later app adoption timestamps. License expiration and initial regulation are not business activity dates. National industry percentage and unique active-business count remain unknown. No current-operations, physical-site, geocode, identity-resolution or public-export claim is introduced.

## Standalone use and integration

```powershell
node scripts/report-ut-childcare.mjs
node scripts/report-ut-childcare.mjs --receipt 'C:\Master Data\datahub\data\industry-segments\runs\c82c25f1-4dcc-4a68-aebe-fd91d81cefe0\state-ut-childcare-centers-retained-UT\jobs\e62e5abb-52f9-4cb7-8984-4917de926293\receipt.json'
node scripts/report-state-access.mjs
```

The first command loads the pinned enrollment and returns aggregate-only reporting. Missing enrollment is `not-enrolled`; a missing installed receipt is `unavailable`, never measured zero. Invalid hashes, paths or evidence fail verification without a network fallback. The CLI returns exit 2 for unavailable enrollment and exit 1 for failed verification.

The state ledger attaches Utah's local evidence under `localSourceCandidateEvidence`. Its national access classification, counts, dispatch-readiness assessment and other states remain unchanged. This is a local reporting interface, not a completed heatmap UI integration; a separate read-only UI integration is still needed for business-facing visualization.

Rollback removes the Utah reporting enrollment and ledger projection while preserving the original source, normalized release, app receipts and previously generated reports. No data needs to be downloaded again.

## Verified release — September 8, 2026 (Central)

Full `npm run check` passed with 1,443 tests: 1,432 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. TypeScript and the production Node dependency audit passed (zero reported vulnerabilities). All 82 pending production pins remain unchanged. The local check log is `data/tmp/ut-reporting-full-check.log`.

The generated report is `data/state-access/reports/20260909011138-1a080ba6-3d4f-4812-a5cd-9e587c562c02.json`, SHA-256 `5f2081f75f3ef0699423295b471b1d52739b57ba52c61dd8a8b2b066d21b5f58`. Comparison against the preceding report proved identical national summary and every other state/industry cell; only Utah's local candidate evidence was added. The 459 cells still comprise 202 national-state evidence, 8 direct-state reporting, 60 unmeasured and 189 missing cells.

Utah local evidence contains 422 accepted candidates, zero quarantine and 113 reported ZIP5 values. All 422 lack supplied coordinates, operating-status evidence and specified address role; no ZIP4 was supplied. Utah's 100% means all accepted rows in this cohort report Utah addresses—not 100% industry completeness. Original observation is `2026-09-08T22:59:26.309Z`; the linked app receipt's adoption completion is `2026-09-09T00:55:38.225Z`. Later managed-operation finalization is not a fresh source observation.
