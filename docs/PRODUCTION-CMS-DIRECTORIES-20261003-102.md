# Proposed additive CMS directory production — October 3, 2026

Plan 102 is the current clean-repository successor after adding the fail-closed ACS ZCTA demographic candidate-row validator.

- Run ID: `production-cms-directories-20261003-102`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-102.json`
- Exact confirmation SHA-256: `b29cafe216657a2b5706d3a8458df52934bf472951b6792ed106d7892a28f1b5`
- Plan file SHA-256: `52109b823c3a6bcc9ddac07362c846c3621f5753e3b7dd8180cd9a48f272bdb7`
- Planning repository commit: `b15fca8`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline/geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The ACS prerequisite now validates an exact 189-cell candidate roster across B01001, B02001, B03002, and B04006 for one five-digit Census ZCTA. It requires raw E, M, EA, and MA values, preserves negative sentinels verbatim, rejects numeric coercion and missing or extra cells, and creates no receipt, staging directory, release, pointer, authorization state, percentage, or ZIP claim. Default production admission remains blocked because trusted official metadata, an approved authorization receipt, an immutable ACS source release, and official sentinel semantics are absent.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 192,314,535,936 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The focused ACS suite passed 7/7, TypeScript passed, focused ESLint passed, and diff checks passed. This contract-only successor has not been represented as a new full repository gate.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 101 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 102.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-102 --expected-plan-sha256 b29cafe216657a2b5706d3a8458df52934bf472951b6792ed106d7892a28f1b5
```
