# Proposed retained-data production reconciliation — October 4, 2026

Plan 138 is the planning-only successor after the broad-organization ZIP evidence implementation commit `651c6b50f5ef9350c6665c4fb00eb7b2cbc5bc57`. It supersedes Plan 137 for any future execution; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-138`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-138.json`
- Exact confirmation SHA-256: `3e87797da57d67a0148fefd67c3d36d33c9a58b69b4251e8fae845286162189b`
- Plan file SHA-256: `e5f6c385679e3f3a30858328a8f0902127e5a7fdfc75b3db47af3e3c682da242`
- Planning repository commit: `651c6b50f5ef9350c6665c4fb00eb7b2cbc5bc57`

The plan contains eight sequential retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It pins 25 governed sources, four selected retained-input declarations, eight stage scripts, and 1,922 implementation files. The `national-12g` profile sets a 12 GiB Node old-space ceiling with a 16 GiB minimum-free and 24 GiB minimum-total memory preflight. It preserves the selected seven-publisher childcare cohort, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. It confirmed the retained CMS hospital and nursing-home inputs. Available disk was 161,867,767,808 bytes against a required floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 137 and all earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 138 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-138 --expected-plan-sha256 3e87797da57d67a0148fefd67c3d36d33c9a58b69b4251e8fae845286162189b
```
