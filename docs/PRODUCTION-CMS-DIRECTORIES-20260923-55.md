# Proposed additive CMS directory production — September 23, 2026

Fresh governed planning completed after implementation commit `f78629a`. That commit exposes the independently verified four-wave current-gap authorization chain inside Co*Tive Collector through a protected, read-only endpoint and management panel. It adds no approval or execution control and keeps actual data coverage distinct from packet coverage.

- Run ID: `production-cms-directories-20260923-55`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20260923-55.json`
- Exact confirmation SHA-256: `3f1f262365b472fafccbd82db7a0f77c82f9bd212de45cb14b40f62c248c4286`
- Planning implementation commit: `f78629a`

The retained-only plan includes the governed production source roster, baseline and geographic inputs, existing MA/NJ/recovered-TN/OH childcare inputs, retained childcare, Minnesota credential reporting, 5,419 CMS hospital directory rows, and 14,690 CMS nursing-home directory rows. The CMS rows remain local-review-only publisher directory records, not verified unique businesses, physical sites, or current operations.

If separately approved, eight sequential stages would build and verify new registry, entity-resolution, benchmark, and coverage releases. Publication is not atomic across the four datasets. The run has zero source-acquisition or network stages. No USPS dependency is selected.

Read-only exact-plan revalidation returned `READY`; every current pin and retained CMS input was reconstructed and verified, and writes performed were false. The `national-12g` profile applies a 12,288 MiB V8 old-space setting. At validation, available disk was 239,374,671,872 bytes and the current-output rebuild floor was 13,309,329,011 bytes.

The complete repository check passed: 2,581 tests, 2,512 passed, 69 intentionally skipped, zero failed, and zero cancelled. Lint, production web and desktop builds, desktop control-plane smoke, focused current-chain service/HTTP/UI/security tests, TypeScript validation, and `npm audit --omit=dev` passed; the audit reported zero vulnerabilities.

Immutable local-review matrix release `national-goal-completion-20260923152841-e96af677`, manifest SHA-256 `07c37108efff3d97e8d7b95920740e497c7acf7a68690c6f2573ae43e1c51273`, report SHA-256 `d6488ec20d5c16eb768090530db7243bb645bbb19e000ae8e8e4924750a7d478`, remains the actual broad-layer evidence view: 11/51 jurisdictions admitted and 40 unresolved data gaps.

The four-wave immutable chain remains exact:

- Wave 1 artifact `3ffe3f2022e251817a75476e7d7b99b5fd4222bd78193c36ed8d163b7a1cffd1` — IL, MS, AR, KY, HI, KS, NV, UT, WA, OK.
- Wave 2 artifact `14df71ffa25aeb6c62e091b39549287e5d7b9fd11a8ddf1d24375e3ce7610056` — AL, AZ, CA, GA, ID, IN, LA, MA, MD, ME.
- Wave 3 artifact `b9c9d96e539f035091814635a1fb0a0ca01d9061ab65783687b1147a6c7083e4` — MI, MN, MO, MT, NC, ND, NH, NJ, NM, OH.
- Wave 4 artifact `928f95ace996e5c6dc55f6c7d86a680ca0342ee389dbce26e7fefe95e304d446` — RI, SC, SD, TN, VA, VT, WI, WV, WY, NE.

The app view independently verifies the exact release chain and gap-projection lineage before showing it. It reports all 40 unique current gap states and 351 gate items, all approval-only and `HOLD`, with no acquisition, contact, download, payment, record request, network, pointer, or production authority. It explicitly reports 40/40 packet coverage and zero unpacketized gaps separately from unchanged actual coverage of 11/51 and 40 unresolved data gaps. The endpoint accepts only an authenticated empty GET, and the UI fails closed without cached details.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 54 and every earlier CMS directory plan or approval are superseded. No production execution occurred while preparing this plan.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20260923-55 --expected-plan-sha256 3f1f262365b472fafccbd82db7a0f77c82f9bd212de45cb14b40f62c248c4286
```
