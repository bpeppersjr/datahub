# Proposed additive CMS directory production — October 2, 2026

Plan 90 is the current clean-repository successor after committing the governed USPS acceptance path and retained IRS state-adjacent evidence for the broad-business completion view.

- Run ID: `production-cms-directories-20261002-90`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-90.json`
- Exact confirmation SHA-256: `ea2b3dc41c6f3e0b3e59368b59c3b9dda9443f7ca01b359c4829117e3825aad3`
- Plan file SHA-256: `53d29d469b6b39ff07ce12a99ac29223d15b1f5cf044316ee8ac6aebe4cd27de`
- Planning repository commit: `86ce04e`
- Created: `2026-10-03T01:20:30.064Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The national ZIP goal acceptance now distinguishes the still-blocked universal `every-valid-usps-zip` claim from the narrower `complete-current-usps-area-district-assignment-set` claim. The latter can pass only with an exact governed dependency, fixed contained assignment artifact, current month/export policy, complete membership reconciliation, and no asserted deliverability or ZCTA equivalence. No qualifying retained USPS operational release is installed, so the universal goal remains blocked and no ZIP coverage has been promoted.

The broad-business selected-state view now composes independently verified retained IRS EO BMF filing-address evidence as adjacent evidence only. The card reports tax-exempt organization filing-address rows and ZCTA/nonpolygon counts without changing broad-layer availability, denominators, the 40-state broad-layer gap, generic entity totals, current-operation claims, or production pointers.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 229,122,584,576 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Independent cross-review closed all findings. The focused suite ran 39 tests with zero failures. The full repository gate ran 3,009 tests: 2,934 passed, 75 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, 200% keyboard UI acceptance, and production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 89 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 90.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-90 --expected-plan-sha256 ea2b3dc41c6f3e0b3e59368b59c3b9dda9443f7ca01b359c4829117e3825aad3
```
