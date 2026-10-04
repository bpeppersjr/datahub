# Proposed retained-data production reconciliation — October 4, 2026

Plan 139 is the planning-only successor after registry-location ZIP status integration commit `530e1fa4b7585facb2253da695f2fac0b8684285`. It supersedes Plan 138 for any future execution; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-139-02`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-139-02.json`
- Exact confirmation SHA-256: `34d50c0d0564b8cf71c501babd762ba537be7fbac1e2f50068516bec95b26434`
- Plan file SHA-256: `cc0cf0c844d0563df93798e64c66d11dcefb050047f714239fb097a371eb0731`
- Planning repository commit: `530e1fa4b7585facb2253da695f2fac0b8684285`

The plan contains eight sequential retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It pins 25 governed sources, four selected retained-input declarations, eight stage scripts, and 1,926 implementation files. The `national-12g` profile sets a 12 GiB Node old-space ceiling with 16 GiB minimum-free and 24 GiB minimum-total memory preflight. It preserves the selected seven-publisher childcare cohort, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 158,629,797,888 bytes against a required floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 138 and all earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 139 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-139-02 --expected-plan-sha256 34d50c0d0564b8cf71c501babd762ba537be7fbac1e2f50068516bec95b26434
```
