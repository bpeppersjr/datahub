# Proposed additive CMS directory production — October 3, 2026

Plan 105 is the current clean-repository successor after publishing and registering the pointer-free ZCTA demographic-readiness lookup index.

- Run ID: `production-cms-directories-20261003-105`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-105.json`
- Exact confirmation SHA-256: `d602c3dcd46987cf801f887e75ce073e13188eb6ce4bc266d32fbf2a52cf5b53`
- Plan file SHA-256: `55126bcd9b2a196e03e985d4f203587f7f82fbd18985fe2785bc844b74af3e1a`
- Planning repository commit: `5d40a5c`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline/geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The new pointer-free index conserves all 33,791 selected demographic-readiness rows across 99 prefix shards. Its independent verifier reconstructs each source offset, row hash, shard, inventory, and content-derived release identity. Runtime requests now read one bounded shard and at most one exact authenticated source row rather than scanning the 13.7 MB source artifact. The index adds no demographic breakdown, GDP allocation, official USPS ZIP evidence, source acquisition, current pointer, or production enrollment.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 188,736,778,240 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused index, reader, HTTP, and UI checks passed 38/38. Independent index replay, TypeScript, focused ESLint, full lint (zero errors; four pre-existing warnings), production and desktop builds, desktop control-plane smoke, stop/relaunch, and the production dependency audit passed. The full parallel repository test attempt completed 3,209 passes, 77 skips, and 11 failures: ten were caused by stale synthetic Florida test ownership artifacts from an earlier run and passed 13/13 after that exact directory was quarantined; the remaining SNAP mutation case passed 12/12 in its focused suite. This is recorded as isolated verification, not represented as a clean single-pass full gate.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 104 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 105.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-105 --expected-plan-sha256 d602c3dcd46987cf801f887e75ce073e13188eb6ce4bc266d32fbf2a52cf5b53
```
