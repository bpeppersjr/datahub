# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after commit `4dec466` published a separate immutable pre-production coverage catalog for the already-retained CMS hospital and nursing-home directory cohorts. The catalog is evidence about retained row coverage only; it is not a production input, registry dependency, output, national reporting denominator, or approval.

- Run ID: `production-cms-directories-20260923-43`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-43.json`
- Exact confirmation SHA-256: `6efb537466eefb7ee4b3c0c14b3f2f904af4eaab2c1342ec518a3c31507676e1`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

The separate catalog release is `cms-retained-directory-coverage-catalog-379f82bdf30a2834`, manifest SHA-256 `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`. Its 56 ordered jurisdiction rows and two source summaries conserve 20,109 rows: 20,034 state/D.C. and 75 territory rows. It contains no entity names, source record identifiers, addresses, ZIP values, or coordinates. It performed zero source actions and network requests, wrote no `current.json`, and explicitly sets production enrollment and national-reporting-denominator enrollment to false. The production plan neither consumes nor emits this catalog.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS directory inputs were confirmed, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,192,685,568 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,535 tests, 2,466 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, TypeScript, production web and desktop builds, desktop control-plane smoke, retained CMS source replay, catalog conservation/tamper checks, and exact SHA-pin CLI checks passed. The required stop script released the prior instance before testing. `npm audit --omit=dev` reported zero vulnerabilities.

The newest verified goal-completion release remains `national-goal-completion-20260923080714-1c72c520`, report SHA-256 `ef67d4fe5a93ddaf794ac7ff62c774f83a21c78990ada3d5b84a6f83c0a6b34e`. It contains 51 jurisdictions and eight categories; the broad layer is available in nine jurisdictions and unmeasured in 42. Overall all-business completion remains null. The current ZIP denominator audit remains `zip-denominator-audit-5d4eb9cf1e530323b2d8f22f`; all ZIP rows remain operationally unverified without an authoritative USPS denominator.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals, including plan 42, are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-43 --expected-plan-sha256 6efb537466eefb7ee4b3c0c14b3f2f904af4eaab2c1342ec518a3c31507676e1
```
