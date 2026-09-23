# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after commits `38e72bf` and `00d0438`. The first adds an explicit `tax-exempt-organizations` flat-file category bound only to retained IRS EO BMF profiles and the existing local-review export gate. The second makes exact USPS ZIP5 member-set reconciliation mandatory whenever a future governed USPS dependency is selected. This plan selects no USPS dependency, so its operational ZIP denominator remains unverified and Census ZCTA geometry remains a separate evidence class.

- Run ID: `production-cms-directories-20260923-45`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-45.json`
- Exact confirmation SHA-256: `c4ac99f0cce57c148bebb47a1623cce1fa0919a1398c3d60ef90eed290430da5`
- Planning implementation commits: `38e72bf`, `00d0438`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

The catalog release remains `cms-retained-directory-coverage-catalog-379f82bdf30a2834`, manifest SHA-256 `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`. Planning and every stage boundary recheck the manifest and artifact bytes, replay the full catalog verifier, and bind both catalog source summaries to the exact selected hospital and nursing source declarations. Its 56 ordered jurisdiction rows and two source summaries conserve 20,109 rows: 20,034 state/D.C. and 75 territory rows. It remains outside source, optional-source, input, stage, registry-dependency, output, receipt, current-pointer, production-enrollment, and national-reporting-denominator paths.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has 25 governed source pins, four optional-source pins, four input pins, and no source-acquisition or network stages. The new USPS reconciliation implementation is pinned as code but produces no USPS claim or artifact because this plan has no authorized governed USPS input.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS directory inputs and the bound catalog evidence were verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 241,054,380,032 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,538 tests, 2,469 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, TypeScript, production web and desktop builds, desktop control-plane smoke, retained CMS source replay, catalog conservation/tamper checks, IRS tax-exempt export policy/provenance checks, exact USPS member-set source replay, same-count member-substitution rejection, and exact SHA-pin CLI checks passed. `npm audit --omit=dev` reported zero vulnerabilities.

Read-only ZIP audit schema 1.3.0 produced `zip-denominator-audit-dbb540102808fdd023589476` and passed both current registry contracts. All 48,194 production ZIP rows remain operationally unverified because current production has no governed USPS dependency. The audit does not infer USPS validity from the 33,791 governed Census ZCTA members or from source-reported ZIP5 values.

The newest verified goal-completion release remains `national-goal-completion-20260923080714-1c72c520`, report SHA-256 `ef67d4fe5a93ddaf794ac7ff62c774f83a21c78990ada3d5b84a6f83c0a6b34e`. It contains 51 jurisdictions and eight categories; the broad layer is available in nine jurisdictions and unmeasured in 42. Overall all-business completion remains null.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. All earlier CMS directory plans and approvals, including plans 42 through 44, are superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-45 --expected-plan-sha256 c4ac99f0cce57c148bebb47a1623cce1fa0919a1398c3d60ef90eed290430da5
```
