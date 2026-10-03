# Proposed additive CMS directory production — October 3, 2026

Plan 94 is superseded by Plan 95 after the childcare state-industry availability projection, exact-ZIP childcare interface, and ZCTA demographic-input readiness release were committed. It must not be executed.

- Run ID: `production-cms-directories-20261003-94`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-94.json`
- Exact confirmation SHA-256: `3ed32d8b9ce2f47858ca0dbdd064458e2730546937f089214321521b23fd9426`
- Plan file SHA-256: `157f368a252f3f08de943514a2fda3ef10eabcd1da07f279020faa085fec382f`
- Planning repository commit: `c87443a`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

ZIP Economy now displays retained CMS hospital and nursing-home directory evidence for an exact reported ZIP. The sources, row counts, reported-state distributions, dates, and recovery lineage remain separate. The strict client contract rejects malformed provenance and denominator drift. The panel expressly does not characterize active businesses, verified physical sites, current operations, or completeness.

Pointer-free release `retained-childcare-zip-evidence-6a696d16df9ccec8836e7bd38872feda3942293d9ff19ad5f528ac41a088fada`, manifest SHA-256 `6ca80e31d73f033a5e6945f54badf34c4ceb73b21e7e0ddbdae66a77d80ce48b`, preserves 12,206 retained source-candidate rows from seven state cohorts: 12,205 have reported ZIP5, zero are missing ZIP, and one Maryland row remains separately classified as an invalid source ZIP range. The service indexes 2,359 ZIPs without deduplicating businesses, asserting physical sites or current operations, assigning counties, aggregating ZIP4, writing a current pointer, or enrolling a national denominator.

Pointer-free release `zcta-economic-model-input-cohort-0d42c0d02977132557b91708a5b58f4fbbaab2dfc2c43b2517c267c7b79839fe`, manifest SHA-256 `2eced7894671c256800b4e08edfac48b343fc4629725aecb67203418ecc00d7e`, conserves 65,631 county–ZCTA relationships across 33,791 Census ZCTAs. It identifies 46,320 relationships with material crosswalk membership and direct BEA county input and 19,311 blocked relationships. All 65,631 relationships remain model-withheld: the release emits no allocation weights, numeric ZIP GDP, demographic GDP slices, USPS ZIP claims, or active-business claims.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 223,096,430,592 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The clean full repository gate ran 3,075 tests: 3,000 passed, 75 skipped, and zero failed. One prior full attempt encountered a transient SNAP fixture parse conflict; the complete 12-test SNAP suite then passed in isolation, and the entire repository gate passed on rerun. Lint completed with four pre-existing warnings and no errors; TypeScript, both native release verifiers, Electron 200%/narrow acceptance, web and desktop builds, desktop control-plane smoke, and the production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 93 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 94.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-94 --expected-plan-sha256 3ed32d8b9ce2f47858ca0dbdd064458e2730546937f089214321521b23fd9426
```
