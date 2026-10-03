# Proposed additive CMS directory production — October 3, 2026

Plan 97 is superseded by Plan 98 after the tab-focused Business Intelligence change and retained readiness overlays were committed. It must not be executed.

- Run ID: `production-cms-directories-20261003-97`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-97.json`
- Exact confirmation SHA-256: `d621c85f5e705063d10d7c7467136a031d3d1c98b9bede98c9f3dbc7128ea883`
- Plan file SHA-256: `025c25c92d4872b6f0ac1b34a5a13bd7abd15f57b28b2cbc89abd9e7a346a579`
- Planning repository commit: `642dbf0`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The Coverage and Industries right-side summary now reads the exact registered temporal-claim matrix through a protected read-only endpoint. It displays 30 retained source classifications, 22 source-defined-current-membership cohorts, 11 of 51 broad state/D.C. source jurisdictions, 40 broad gaps, and zero of 51 verified-current-complete jurisdictions. Active-business count and all-business completeness remain unknown.

The pointer-free `zcta-gdp-model-specification-9d24fc138d755c02351fc32e82f2f068e483cfbdfa13a68952fff1454c7577d6` release, manifest SHA-256 `4589ab319abc68b9f01792195c0bfa3330393dab37e3e7658180d94d63ac28de`, records a proposed payroll-area hybrid with area and establishment sensitivity methods. Its decision remains HOLD: model approval, output authorization, and numeric GDP emission are false.

The pointer-free nursing-home/NPPES overlap-readiness release `cms-nursing-home-nppes-overlap-readiness-f57a299b2c0cccbcd038716b8dfe70adac8a7b43bdfaaab6b4f18ccf2634dfbe`, manifest SHA-256 `af73ebf41f534a7c07404f4458bd7a663fdc7774046b71fa79f1abe3e5047233`, conserves all 14,690 retained nursing-home rows. Exact Unicode-safe name and full-address matching found 285 single distinct-NPI candidates, 37 ambiguous rows, and 14,368 unmatched rows, with 390 distinct-NPI candidate links backed by 391 retained location assertions. It performs no merge or NPI inference and makes no unique-business, operating-site, current-operation, or completeness claim.

The ACS ZCTA demographic prerequisite is inspection-only and replays all 33,791 governed ZCTAs. It defines the intended B01001, B02001, B03002, and B04006 table groups while explicitly blocking substantive publication because trusted official group metadata, an approved structured authorization receipt, an immutable governed ACS source release, and official sentinel/annotation semantics are absent. It has no publish, verification, staging, pointer, or ingestion path.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 208,608,124,928 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The full repository gate ran 3,219 tests: 3,142 passed, 77 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; TypeScript, web and desktop builds, desktop control-plane smoke, native release verifiers, independent reviews, and the production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 96 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 97.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-97 --expected-plan-sha256 d621c85f5e705063d10d7c7467136a031d3d1c98b9bede98c9f3dbc7128ea883
```
