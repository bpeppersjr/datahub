# Proposed retained-data production reconciliation — October 4, 2026

Plan 140 is the corrected planning-only successor after exact-ZIP industry evidence matrix v1.6 commit `7b5eef6`. It supersedes Plan 139-02 for any future execution; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-140`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-140.json`
- Exact confirmation SHA-256: `53baec981b4a523ac40d4fd8b493516899bf1d8eb274ea6f2afa0bac63cd3212`
- Plan file SHA-256: `b313ff8ac1e050c7300e691b81b87e986e301ec760a45247c34586cf99e0bf52`
- Planning repository commit: `7b5eef6`

The plan contains eight sequential retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It pins 25 governed sources, four retained-input selections, eight stage scripts, and 1,926 implementation files. The exact retained selections are `config/retained-childcare-registry-selection.json`, `config/mn-credential-registry-selection.json`, `config/cms-hospital-retained-selection.json`, and `config/cms-nursing-home-retained-selection.json`. The `national-12g` profile sets a 12 GiB Node old-space ceiling with 16 GiB minimum-free and 24 GiB minimum-total memory preflight. Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 157,033,742,336 bytes against a required floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 139-02 and all earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 140 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-140 --expected-plan-sha256 53baec981b4a523ac40d4fd8b493516899bf1d8eb274ea6f2afa0bac63cd3212
```
