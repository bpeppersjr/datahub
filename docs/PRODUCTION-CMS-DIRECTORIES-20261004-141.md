# Proposed retained-data production reconciliation — October 4, 2026

Plan 141 is a planning-only successor prepared after implementation commit `ade5e217a88e630d1a4e56530a630117a838db3c`. It carries forward the four retained selections from Plan 140 and does not approve or start production work.

- Run ID: `production-cms-directories-20261004-141`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-141.json`
- Exact confirmation / plan SHA-256: `25de482511ca93fd689460f0377b4d5343294179ae3b397a5d3c5281aba6c67a`
- Plan file SHA-256: `a29c7f17f4987c3f2a9d929da220f285a45628410ea6abf74882b797a31e93eb`
- Planning repository commit: `ade5e217a88e630d1a4e56530a630117a838db3c`

The plan contains eight retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It uses the `national-12g` profile (`--max-old-space-size=12288`) and pins the retained selections `config/retained-childcare-registry-selection.json`, `config/mn-credential-registry-selection.json`, `config/cms-hospital-retained-selection.json`, and `config/cms-nursing-home-retained-selection.json`. Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

Exact-plan preflight returned `READY`, revalidated pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 156,803,633,152 bytes against a required floor of 13,309,329,011 bytes. Preflight is read-only; no production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 140 and earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 141 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment. The generated plan remains a local retained artifact and is not included in Git.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-141 --expected-plan-sha256 25de482511ca93fd689460f0377b4d5343294179ae3b397a5d3c5281aba6c67a
```
