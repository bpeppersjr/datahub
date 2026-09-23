# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after commit `06b7eac` added an exact, read-only pin for the immutable CMS retained-directory coverage catalog. The catalog is pre-production evidence about retained row coverage only. It remains outside source, optional-source, input, stage, registry-dependency, output, receipt, current-pointer, production-enrollment, and national-reporting-denominator paths.

- Run ID: `production-cms-directories-20260923-44`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-44.json`
- Exact confirmation SHA-256: `2353169442a1a75cfd007ebca20fcd74b1c52a2e706da50fa5ea970f0f03458e`
- Planning implementation commit: `06b7eac`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

The catalog release is `cms-retained-directory-coverage-catalog-379f82bdf30a2834`, manifest SHA-256 `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`. Planning and every stage boundary recheck the manifest and artifact bytes, replay the full catalog verifier, and bind both catalog source summaries to the exact selected hospital and nursing source declarations. Its 56 ordered jurisdiction rows and two source summaries conserve 20,109 rows: 20,034 state/D.C. and 75 territory rows. It contains no entity names, source record identifiers, addresses, ZIP values, or coordinates. It performed zero source actions and network requests, wrote no `current.json`, and explicitly sets production enrollment and national-reporting-denominator enrollment to false.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has 25 governed source pins, four optional-source pins, four input pins, and no source-acquisition or network stages. No USPS operational ZIP selection is present because no authorized governed local release is selected; Census ZCTA polygons, source-reported ZIP5, and ZBP ZIP aggregates remain separate evidence classes.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS directory inputs and the bound catalog evidence were verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,114,406,912 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,535 tests, 2,466 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, TypeScript, production web and desktop builds, desktop control-plane smoke, retained CMS source replay, catalog conservation/tamper checks, exact source cross-binding, stage-boundary drift checks, and exact SHA-pin CLI checks passed. The required stop script released the prior instance before testing. `npm audit --omit=dev` reported zero vulnerabilities.

The newest verified goal-completion release remains `national-goal-completion-20260923080714-1c72c520`, report SHA-256 `ef67d4fe5a93ddaf794ac7ff62c774f83a21c78990ada3d5b84a6f83c0a6b34e`. It contains 51 jurisdictions and eight categories; the broad layer is available in nine jurisdictions and unmeasured in 42. Overall all-business completion remains null. The current ZIP denominator audit remains `zip-denominator-audit-5d4eb9cf1e530323b2d8f22f`; all ZIP rows remain operationally unverified without an authoritative USPS denominator.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals, including plans 42 and 43, are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-44 --expected-plan-sha256 2353169442a1a75cfd007ebca20fcd74b1c52a2e706da50fa5ea970f0f03458e
```
