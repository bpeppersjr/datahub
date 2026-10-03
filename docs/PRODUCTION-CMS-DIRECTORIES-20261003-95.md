# Proposed additive CMS directory production — October 3, 2026

Plan 95 is superseded by Plan 96 after the governed national business temporal-claim matrix, ZIP denominator gap cohort, and ZCTA GDP allocation-method evaluation were committed. It must not be executed.

- Run ID: `production-cms-directories-20261003-95`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-95.json`
- Exact confirmation SHA-256: `b10a01e56d5012ce4b53be396027a2df294d68f401808b5094d5e5475fd6002c`
- Plan file SHA-256: `e77c48b3327f9143a9cf3810fd7c57efc4af8ebd81f9942d046afc798454a1a7`
- Planning repository commit: `d169527`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Pointer-free childcare projection `childcare-state-industry-availability-projection-db15ef4058400692898bda040f317057949323cb5fcaacd58d994eecc68c5322`, manifest SHA-256 `d16a222a0a1aea770dc63f73c450bb00ad2321df12ec293a1289cb187503a58a`, records seven measured retained publisher cohorts—Colorado, Connecticut, Iowa, Maryland, Pennsylvania, Utah, and Vermont—and 44 unmeasured state/D.C. jurisdictions. It conserves 12,206 source-candidate rows as 12,205 ZIP-present, zero missing-ZIP, and one separately invalid Maryland ZIP. These are availability measures, not unique businesses, verified sites, current operations, or completeness.

ZIP Economy now validates and displays that registered retained childcare evidence for an exact reported ZIP. The client pins the exact release, manifest, source metadata, cohort totals, row bounds, and Maryland invalid bucket. It separates publisher cohorts and reported states, aborts stale requests, and distinguishes absence, unavailability, and malformed evidence without inferring zero, closure, USPS validity, or completeness.

Pointer-free local-review release `zcta-demographic-input-readiness-4f26ad46c785afc6b9e9044bce377af1d31eec0bfef9d7da0524c63ae05d7023`, manifest SHA-256 `00e6874f173b0e824a2f169b4b752861f52e48b50027df27b9f17cfb97b3d952`, conserves all 33,791 governed Census ZCTAs. It retains direct 2020 population and housing totals—335,064,600 people and 142,228,658 housing units nationally—and explicitly records race, ancestry/lineage, sex, and age slices as unavailable. It produces no demographic percentages, GDP, operational USPS ZIP claim, current pointer, or production enrollment.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 221,159,223,296 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The full repository gate ran 3,102 tests: 3,026 passed, 76 skipped, and zero failed. The additional skip is the symlink-specific readiness test on a Windows host that denied symlink creation; hardlink, identity-drift, containment, cancellation, concurrency, lock-ownership, closed-inventory, tamper, and rehashed-tamper cases passed. Lint completed with four pre-existing warnings and no errors; TypeScript, both native release verifiers, Electron 200%/narrow acceptance, web and desktop builds, desktop control-plane smoke, and the production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 94 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 95.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-95 --expected-plan-sha256 b10a01e56d5012ce4b53be396027a2df294d68f401808b5094d5e5475fd6002c
```
