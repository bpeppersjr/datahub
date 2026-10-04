# Proposed retained-data production reconciliation — October 3, 2026

Plan 137 is the clean-code successor after the workspace redesign commit `418d5dbabd6c7f1a71771733bec1d149782c6e02`. This supersedes plan 136 for any future execution; it does not approve or start production work.

- Run ID: `production-cms-directories-20261003-137`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-137.json`
- Exact confirmation SHA-256: `7348687ed3bcc0f09b4003b010c35185aecb844ed30f06019b4383ceb607b79c`
- Plan file SHA-256: `a6e3090847851ac9fe2b4bf5f28b20222476637ce25b3eaa7aae5cd86c67314a`
- Planning repository commit: `418d5dbabd6c7f1a71771733bec1d149782c6e02`

The plan contains eight sequential retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It pins 25 governed sources, four selected retained-input declarations, eight stage scripts, and 1,922 implementation files. The `national-12g` profile sets a 12 GiB Node old-space ceiling with a 16 GiB minimum-free and 24 GiB minimum-total memory preflight. It preserves the selected seven-publisher childcare cohort, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. It confirmed the retained CMS hospital and nursing-home inputs. Available disk was 162,695,618,560 bytes against a required floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 136 and all earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 137 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-137 --expected-plan-sha256 7348687ed3bcc0f09b4003b010c35185aecb844ed30f06019b4383ceb607b79c
```
