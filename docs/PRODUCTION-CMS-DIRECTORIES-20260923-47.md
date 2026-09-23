# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after commit `7ca8bbe`. Co*Tive now exposes a count-and-digest-only national ZIP evidence summary that independently separates registry ZIP5 keys, record-contributed and denominator-only rows, Census ZCTA statistical geography, USPS assignment evidence, and the non-geometric ZIP+4 policy. It remains decoupled from the national business-completion matrix and keeps all-business and active-business completion percentages null.

- Run ID: `production-cms-directories-20260923-47`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-47.json`
- Exact confirmation SHA-256: `ca69ffd9ac2f6ed98f474ec311f15ec9f11dd9cfb7ab07d4498376c970a1fae5`
- Planning implementation commit: `7ca8bbe`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. Those CMS directory rows remain local-review-only publisher records, not verified unique businesses, physical sites, or current operations.

The catalog release remains `cms-retained-directory-coverage-catalog-379f82bdf30a2834`, manifest SHA-256 `2eef0a317cb190968763fad2a2f90069f6b7a3fb86291ec6fde59a4f5671363c`. Planning and every stage boundary recheck the manifest and artifact bytes, replay the full catalog verifier, and bind both catalog source summaries to the exact selected hospital and nursing source declarations. Its 56 ordered jurisdiction rows and two source summaries conserve 20,109 rows: 20,034 state/D.C. and 75 territory rows. It remains outside source, optional-source, input, stage, registry-dependency, output, receipt, current-pointer, production-enrollment, and national-reporting-denominator paths.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has 25 governed source pins, four optional-source pins, four input pins, and no source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`: every current pin was reconstructed, both retained CMS directory inputs and the bound catalog evidence were verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 240,960,495,616 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,550 tests, 2,481 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, TypeScript, production web and desktop builds, desktop control-plane smoke, and the governed ZIP summary replay/tamper checks passed. `npm audit --omit=dev` reported zero vulnerabilities.

Immutable local-review release `national-zip-coverage-20260923121929-ffe55c41`, artifact SHA-256 `772e48a2261f89e8e401de467fc8cd2e60734fa3542dfc7071320c5bf901893a`, independently replay-verified the current retained evidence. It reports 48,194 unique registry ZIP5 keys: 47,995 with record-level source contributions and 199 denominator-only. The independent Census statistical-geography partition has 33,791 same-code ZCTA members, 14,361 source-contributed ZIP5 keys without a same-code ZCTA, 41 denominator-only ZIP5 keys without one, and one explicit placeholder. All 48,194 USPS statuses remain unverified because there is no governed USPS assignment denominator in this plan. ZIP+4 remains separate and non-geometric. No ZIP arrays or samples appear in the compact artifact.

The authenticated Heatmap view now shows these evidence counts while explicitly stating that Census ZCTAs are not USPS delivery boundaries, ZIP totals do not measure business coverage, and active-business completion remains unknown. Immutable summary publication is local-review-only; the API serves a freshly verified live projection rather than mislabeling it as the immutable artifact.

This document and plan do not constitute approval. Plan 47 was never executed and is superseded by Plan 48 after implementation commit `4f342ee` added the governed national ZIP/business evidence alignment and state freshness/authorization visibility. Plan 46 and every earlier CMS directory plan or approval remain superseded.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-47 --expected-plan-sha256 ca69ffd9ac2f6ed98f474ec311f15ec9f11dd9cfb7ab07d4498376c970a1fae5
```
