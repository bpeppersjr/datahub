# Proposed additive CMS directory production — September 23, 2026

> **Superseded without execution.** Implementation commit `c161ef7` added the second current ten-state authorization wave after this plan was prepared, invalidating this plan's code fingerprint. Run `production-cms-directories-20260923-52` was never executed and must not be approved or used. It is replaced by run `production-cms-directories-20260923-53` and the exact confirmation SHA recorded in `docs/PRODUCTION-CMS-DIRECTORIES-20260923-53.md`.

Fresh governed planning completed after implementation commit `6ea4262`. That commit adds a separately versioned, immutable authorization wave for the ten highest-priority current broad-organization gaps without authorizing collection, network use, or publication.

- Run ID: `production-cms-directories-20260923-52`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-52.json`
- Exact confirmation SHA-256: `f23e43135b65172f8acfcff389fc439f15870a1b8cc358f3a537aa9d59475580`
- Planning implementation commit: `6ea4262`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`; every current pin and retained CMS input was reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 240,020,013,056 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,570 tests, 2,501 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, production web and desktop builds, desktop control-plane smoke, focused authorization-wave tests, and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities.

Immutable local-review matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, independently replay-verified 51 jurisdictions and eight categories with zero network requests and no production-pointer changes. Broad jurisdiction evidence is available in 11 of 51 jurisdictions, leaving 40 explicit gaps.

The matrix-aligned gap projection release is `broad-organization-matrix-gap-projection-2026-09-23T15-28-41.546Z-fb0da2b14f4e`, manifest SHA-256 `cedc648f115c1df3a1854a3b87ba9f4e1a6175c28ea851491d83dab2b3006652`, artifact SHA-256 `fb0da2b14f4ea1a269514e78940b79ced457bf5ff35ae7b3928bdea26f5c682b`. It independently joins the verified current matrix to the immutable historical backlog, excludes all 11 admitted jurisdictions from the current gap subset, preserves the 40 remaining states' assessment and gate provenance, performs no network or source actions, grants no acquisition authority, and changes no pointer.

The immutable current authorization-wave release is `broad-organization-current-matrix-authorization-wave-2026-09-23T15-28-41.546Z-3ffe3f2022e2`, manifest SHA-256 `1017fc8561fd5ede768c6a848ac5488d2746e842f3aaca977477ce54c14327c7`, and artifact SHA-256 `3ffe3f2022e251817a75476e7d7b99b5fd4222bd78193c36ed8d163b7a1cffd1`. Its exact wave-one roster is IL, MS, AR, KY, HI, KS, NV, UT, WA, and OK. All ten entries remain approval-only and `HOLD`; acquisition is false, source actions and network requests are zero, and no current pointer changed. The artifact preserves the 40-state current gap denominator and explicitly leaves 30 gaps for later waves.

No remaining already-retained statewide cross-industry source can truthfully move the broad layer from 11/51 to 12/51. Washington L&I contractor licensing and California ABC licensing are statewide but sector-specific; Chicago licensing is substate. The next broad-layer admission therefore requires newly retained, separately authorized cross-industry evidence rather than relabeling a narrower cohort.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 51 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-52 --expected-plan-sha256 f23e43135b65172f8acfcff389fc439f15870a1b8cc358f3a537aa9d59475580
```
