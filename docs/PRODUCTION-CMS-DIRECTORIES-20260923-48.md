# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `4f342ee`. Co*Tive now binds its immutable ZIP evidence summary to the exact current national-business ZIP view, Census ZIP Business Patterns employer baseline, Census ZCTA geography, and registry dependency. The all-state management table also exposes verified temporal-status and authorization-state counts separately from dataset availability; neither is presented as business completeness.

- Run ID: `production-cms-directories-20260923-48`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-48.json`
- Exact confirmation SHA-256: `6e34488a34a72ccdd1c52f161a4a43e0bbb396c61f53c3de60ffca979aef749f`
- Planning implementation commit: `4f342ee`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

The catalog release remains `cms-retained-directory-coverage-catalog-379f82bdf30a2834`, manifest SHA-256 `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`. Its 56 ordered jurisdiction rows and two source summaries conserve 20,109 rows: 20,034 state/D.C. and 75 territory rows.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has 25 governed source pins, four optional-source pins, four input pins, and no source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS directory inputs and the bound catalog evidence were verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 240,918,589,440 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository test run exercised 2,562 tests: 2,492 passed, 69 were intentionally skipped, and one unrelated Windows temporary-file ownership test failed after the replacement file's identity was reused under full parallel load. The isolated test immediately passed 10/10. Lint, production web and desktop builds, desktop control-plane smoke, focused ZIP-alignment and UI tests, and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities.

Immutable local-review alignment release `national-zip-business-alignment-20260923124912-22c478c2`, artifact SHA-256 `8d79dc9f5b8e9967e4d57044080b7c0763ab506939b7410a59b6e8d0c4be63a5`, independently binds an exact 48,194-member ZIP set. It conserves 47,995 record-contributed and 199 denominator-only ZIPs. The published 2023 ZIP Business Patterns employer baseline covers 34,954 ZIPs; 2,874 are explicitly not published and 10,366 are outside the ZBP/ZCTA union. The same-code geography split is 30,917 published ZCTAs, 2,874 unpublished ZCTAs, 4,037 published non-ZCTAs, and 10,366 non-ZCTAs outside the union.

All USPS assignment statuses remain unverified because this plan has no governed USPS assignment denominator. ZIP+4 remains a separate non-geometric field. All-business and active-business completion remain null rather than being inferred from employer establishments, source contribution, temporal status, or authorization state.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 47 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-48 --expected-plan-sha256 6e34488a34a72ccdd1c52f161a4a43e0bbb396c61f53c3de60ffca979aef749f
```
