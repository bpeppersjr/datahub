# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `48f76e3` added the protected, governed reported-organization ZIP evidence view after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-57` was never approved or executed and must not be used. It is replaced by `production-cms-directories-20260923-58` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-58.md`.

Fresh governed planning completed after implementation commit `9d8a1f02cad8f46ea0acab6f50b91aa7320a14eb`. That commit adds an immutable, aggregate-only national geography goal-status release, a protected read-only API, and a Co*Tive management panel. The evidence independently replays the exact Census geography, ZCTA jurisdiction crosswalk, and ZIP summary inputs while keeping Census polygon completeness separate from the unverified USPS operational ZIP denominator.

- Run ID: `production-cms-directories-20260923-57`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-57.json`
- Exact confirmation SHA-256: `3350621cff33e0be552ad3f63fe416bcb7c7f6ee4f935ed1e00d286fd45e3092`
- Planning implementation commit: `9d8a1f02cad8f46ea0acab6f50b91aa7320a14eb`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan preflight returned `READY`; all current pins and retained inputs were reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 239,137,054,720 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The final repository suite passed 2,596 tests: 2,527 passed, 69 intentionally skipped, zero failed, and zero cancelled. The focused geography-status tests passed 18/18. Lint, production web and desktop builds, CLI verification, independent code/security review, runtime restoration, health, and single-listener checks passed.

Immutable geography-status release `national-geography-goal-status-20260923204343-55952349`, manifest SHA-256 `5b933dcda10c3c063a5a10ce3ed83c5391eb17b80ad807a768870b1c8bf5aaad`, artifact SHA-256 `18cb495c6215bad8948c6764b7e3f58c70f01213527bcf4f9f9d56349f75cda1`, verifies 2 nation products, 56 state equivalents, 3,235 county equivalents, and 33,791 2020 ZCTAs. It separately reports 48,194 registry ZIP5 keys as USPS-unverified, including 14,361 source-reported ZIP5 values without same-code ZCTA polygons. ZIP+4 remains separate and non-geometric. The release has no current pointer, row data, ZIP list, approval, acquisition, or execution control.

The proposal registry continues to verify the exact four unapproved Wave 1–4 documents. All remain `PROPOSED`, `NOT APPROVED`, and `NO ACTION AUTHORIZED`. Its 40/40 proposal and packet coverage is not collected-data coverage.

Immutable matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, remains the actual broad-layer evidence view: 11/51 jurisdictions admitted and 40 unresolved data gaps.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 56 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-57 --expected-plan-sha256 3350621cff33e0be552ad3f63fe416bcb7c7f6ee4f935ed1e00d286fd45e3092
```
