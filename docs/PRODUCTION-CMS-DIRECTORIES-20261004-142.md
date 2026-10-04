# Proposed retained-data production reconciliation — October 4, 2026

Plan 142 is the planning-only successor prepared after ZIP temporal qualification enrichment commit `6d3ca7713a849456e199b5cbba04af17a6f0fc2e`. It carries forward Plan 141’s four retained selections; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-142`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-142.json`
- Exact confirmation / plan SHA-256: `17d15cb22ce7f6c2d9d0def2277490b71b5fe2b1aba1027218b33143348f11a4`
- Plan file SHA-256: `324140a3b368f24791ec7bc1e24885feaf62564f8ef31f68b8de0e2a439b46a5`
- Planning repository commit: `6d3ca7713a849456e199b5cbba04af17a6f0fc2e`

The plan contains eight retained-data stages: registry build and verification, entity-resolution build and verification, benchmark build and verification, and coverage-view build and verification. It uses the `national-12g` profile (`--max-old-space-size=12288`) and pins the retained selections `config/retained-childcare-registry-selection.json`, `config/mn-credential-registry-selection.json`, `config/cms-hospital-retained-selection.json`, and `config/cms-nursing-home-retained-selection.json`. Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. Available disk was 156,561,006,592 bytes against a required floor of 13,309,329,011 bytes. Preflight is read-only; no production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 141 and earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 142 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment. The generated plan remains a local retained artifact and is not included in Git.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-142 --expected-plan-sha256 17d15cb22ce7f6c2d9d0def2277490b71b5fe2b1aba1027218b33143348f11a4
```
