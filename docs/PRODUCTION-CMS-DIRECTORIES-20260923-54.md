# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `eceaf21`. That commit completes four separately versioned, ten-state approval-only packets for all 40 current broad-organization gaps. The packets organize authorization work; they do not claim the missing business data has been collected.

- Run ID: `production-cms-directories-20260923-54`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-54.json`
- Exact confirmation SHA-256: `175819c6cf53b183e4129764196c4cb67632e4b80a8a26f27b32dab28e59adac`
- Planning implementation commit: `eceaf21`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`; every current pin and retained CMS input was reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 239,446,061,056 bytes and the current-output rebuild floor was 13,309,329,011 bytes. These are point-in-time prerequisites, not reservations or peak-use guarantees.

The complete repository check passed: 2,575 tests, 2,506 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, production web and desktop builds, desktop control-plane smoke, focused four-wave tests, and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities.

Immutable local-review matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, independently replay-verified 51 jurisdictions and eight categories. Broad jurisdiction evidence remains available in 11 of 51 jurisdictions, leaving 40 actual data gaps.

The matrix-aligned gap projection release is `broad-organization-matrix-gap-projection-2026-09-23T15-28-41.546Z-fb0da2b14f4e`, manifest SHA-256 `cedc648f115c1df3a1854a3b87ba9f4e1a6175c28ea851491d83dab2b3006652`, artifact SHA-256 `fb0da2b14f4ea1a269514e78940b79ced457bf5ff35ae7b3928bdea26f5c682b`.

The exact chained authorization releases are:

- Wave 1 — IL, MS, AR, KY, HI, KS, NV, UT, WA, OK; release suffix `3ffe3f2022e2`; manifest SHA-256 `1017fc8561fd5ede768c6a848ac5488d2746e842f3aaca977477ce54c14327c7`; artifact SHA-256 `3ffe3f2022e251817a75476e7d7b99b5fd4222bd78193c36ed8d163b7a1cffd1`.
- Wave 2 — AL, AZ, CA, GA, ID, IN, LA, MA, MD, ME; release suffix `14df71ffa25a`; manifest SHA-256 `e44004f98d354a7d84670d46c83fa47dce06b61351f65e6074343821a4333d7b`; artifact SHA-256 `14df71ffa25aeb6c62e091b39549287e5d7b9fd11a8ddf1d24375e3ce7610056`.
- Wave 3 — MI, MN, MO, MT, NC, ND, NH, NJ, NM, OH; release suffix `b9c9d96e539f`; manifest SHA-256 `6361a38e9f133e8a17b13ac2635d4283e4b39a46c2820b4be05f502c7f3cb619`; artifact SHA-256 `b9c9d96e539f035091814635a1fb0a0ca01d9061ab65783687b1147a6c7083e4`.
- Wave 4 — RI, SC, SD, TN, VA, VT, WI, WV, WY, NE; release suffix `928f95ace996`; manifest SHA-256 `ce69c69455873d102774b6e6353255f80bd63b3f70e101a7069694f05f821b91`; artifact SHA-256 `928f95ace996e5c6dc55f6c7d86a680ca0342ee389dbce26e7fefe95e304d446`.

Each release contains exactly ten states, binds the immediately prior verified wave, preserves assessment/gate/exclusion provenance, and keeps every state and gate approval-only and `HOLD`. Cumulative conservation is 0+10+30, 10+10+20, 20+10+10, and 30+10+0 = 40. Acquisition is false, source actions and network requests are zero, and no current pointer changed. Zero remaining after wave four means no current gap is missing an authorization packet; it does not mean the 40 data gaps are resolved.

No remaining already-retained statewide cross-industry source can truthfully move the broad layer from 11/51 to 12/51. A real admission requires newly retained, separately authorized cross-industry evidence rather than relabeling a narrower cohort.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 53 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-54 --expected-plan-sha256 175819c6cf53b183e4129764196c4cb67632e4b80a8a26f27b32dab28e59adac
```
