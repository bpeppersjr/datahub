# Proposed additive CMS directory production — October 3, 2026

Plan 124 is the current clean-code successor after recording Arkansas's current paid-bulk source assessment and adding Kentucky's synthetic-fixture-only business-entity bulk contract.

- Run ID: `production-cms-directories-20261003-124`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-124.json`
- Exact confirmation SHA-256: `1963de918ec76885ddbeada3ab2dd0d40b2ad17cbad95974c593c059a809495f`
- Plan file SHA-256: `e115f1928cdbed3cbd47f12516c34558b020fded5ae22c35ce66a3f40ea82477`
- Planning repository commit: `409841493a9034ee132088e216e9e81d6bb66dad`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

Arkansas remains on `HOLD`. Its official subscriber products are now represented accurately, but no schema, safe person-field boundary, change contract, automation authorization, or downstream-use rights have been established. The Kentucky connector is fixture-only and offline: it validates the published 42-field company layout, excludes officer files and person-bearing fields from its normalized projection, separates ZIP5 and ZIP4, and keeps administrative addresses distinct from physical sites. It has no credentials, network path, account action, payment, subscription, acquisition, production enrollment, admission, or pointer authority.

Focused Arkansas and Kentucky tests, the state-source assessment catalog check, connector registry check, targeted lint, and scoped diff checks passed. Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 167,771,455,488 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 123 and all earlier plans or approvals are superseded without execution. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 124.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-124 --expected-plan-sha256 1963de918ec76885ddbeada3ab2dd0d40b2ad17cbad95974c593c059a809495f
```
