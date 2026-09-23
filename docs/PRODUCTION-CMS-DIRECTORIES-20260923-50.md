# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `61313fd`. Co*Tive now admits the already-retained Texas Active Sales Tax Permit Holders outlet cohort as broad jurisdiction licensing/organization evidence under a new versioned contract. It does not treat that cohort as an all-business denominator, a Secretary of State master, or proof of continuous operation.

- Run ID: `production-cms-directories-20260923-50`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-50.json`
- Exact confirmation SHA-256: `15b1e5d0b3dee8665c470e01fbb41156e197119f2484e4becc708e3664dab957`
- Planning implementation commit: `61313fd`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`; every current pin and retained CMS input was reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 240,394,747,904 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,564 tests, 2,495 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, production web and desktop builds, desktop control-plane smoke, focused real-evidence replay, and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities.

Immutable local-review matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, independently replay-verified 51 jurisdictions and eight categories with zero network requests and no production-pointer changes. Broad jurisdiction evidence is now available in 11 of 51 jurisdictions, leaving 40 explicit gaps.

The Texas evidence is pinned to dataset release `tx-active-sales-tax-20260903-004825316Z-3ba279b8`, source release `tx-active-sales-tax-2026-08-29-98b90d177d81493e`, and dataset manifest SHA-256 `7654c7ec1439a29e76abc2e2c19ce05c53901b836f43b1bb42b4c71cd032c499`. It conserves 885,278 source outlet-permit rows as 885,097 normalized profiles plus 181 quarantined rows, reports 700,705 unique source taxpayers and 2,156 contributing ZIP keys, and attributes 885,093 profiles to Texas with one each reported in Colorado, Florida, Louisiana, and Virginia. The source supplies no governed coordinates, so source-level geocoding remains unmeasured with null numerator, denominator, and percentage; jurisdiction-wide coordinates are not borrowed. Outlet permits are not unique businesses, source `Active` does not prove continuous operation, and record-level evidence remains local-review-only. All-business and active-business completion remain null.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 49 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-50 --expected-plan-sha256 15b1e5d0b3dee8665c470e01fbb41156e197119f2484e4becc708e3664dab957
```
