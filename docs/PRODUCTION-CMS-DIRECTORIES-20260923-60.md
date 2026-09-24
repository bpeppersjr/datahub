# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `b87c0716d2cb3ca26f7e518faf3caae0bb342b9f` published the separate governed national SNAP-retailer industry coverage layer after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-60` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-61` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-61.md`.

Fresh governed planning completed after implementation commit `aca500b8d8d7f601e18e06291c425974554145c6`. That commit publishes a separate national pharmacy-industry coverage dataset derived entirely from retained, verified CMS NPPES community/retail-pharmacy evidence and adds non-additive management and exact-ZIP visibility. It does not change the generic business registry, healthcare category, entity resolution, exports, site totals, or completeness measures.

- Run ID: `production-cms-directories-20260923-60`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-60.json`
- Exact confirmation SHA-256: `7be3b32f8dd40622cfdcb4fd41f4dbd74fc6f2c05fe386a3843ffe9d9b5f1e00`
- Planning implementation commit: `aca500b8d8d7f601e18e06291c425974554145c6`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 238,494,920,704 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,637 tests: 2,568 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, TypeScript, production web and desktop builds, exact retained replay, independent code/security review, runtime restoration, health, and single-listener checks passed.

Current derived release `national-pharmacy-industry-coverage-9823b10a8f79907f` is selected by pointer SHA-256 `6162f3c9c54f9091c45b927c77d277e5841ebdafbe4f3b908f97b45b25b68592` and manifest SHA-256 `dca372281e881cb37be1ff8ba020c43d589d98ab08d16612c7792f4bd10bac10`. Its immutable artifacts contain one national summary, 56 exact state/DC/territory rows, and 38,686 ZIP rows.

The pharmacy layer counts 89,077 unique organization NPIs once, separately records 90,074 taxonomy occurrences and 997 repeats, and preserves 87,659 state/DC records, 1,415 territory records, and three unassigned records. It reports 15,376 positive primary-address ZIP5 values, 88,899 exact same-code ZCTA memberships, 175 nonpolygon rows, and 78,524 separately stored ZIP+4 values. The 420 supplementary secondary-address rows remain a separate non-additive measure. Mail-order figures are taxonomy evidence only. The layer makes no unique-business, current-operation, physical-site, governed-geocode, nationwide-completeness, NABP/NCPDP, drive-through, network-affiliation, parent-company, or mail-order-service claim, and has no county assignment.

The registry ZIP evidence-key delta, Census geography status, and broad-layer matrix retain their separate scopes. Broad organization coverage remains 11/51 jurisdictions admitted with 40 unresolved gaps. The four document-only inquiry proposals remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 59 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-60 --expected-plan-sha256 7be3b32f8dd40622cfdcb4fd41f4dbd74fc6f2c05fe386a3843ffe9d9b5f1e00
```
