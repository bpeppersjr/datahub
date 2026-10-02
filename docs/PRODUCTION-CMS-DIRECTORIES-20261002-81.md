# Proposed additive CMS directory production — October 2, 2026

> **Superseded:** Plan 82 replaces this plan after the retained childcare county coverage adapter was added and verified. Plan 81 must not be executed.

Plan 81 is the current clean-repository successor after Co*Tive began exposing configured industries that remain outside the national reporting denominator.

- Run ID: `production-cms-directories-20261002-81`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-81.json`
- Exact confirmation SHA-256: `6090fd2d6cd71fc4a45a6de588232981a54275735cb23f93c1bfd9b801cde693`
- Plan file SHA-256: `60c1ec220e1906b14104bb74f455b7b20b3b3adc3b70641b3a59cd61e7659ab1`
- Planning repository commit: `9f567467876f5b02845b0ea89c6c4428bb6de0bc`
- Outside-denominator UI/API commit: `9f567467876f5b02845b0ea89c6c4428bb6de0bc`
- Created: `2026-10-02T14:26:19.530Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 238,067,716,096 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Coverage and Industries now show childcare, construction, local-business licenses, and sales-tax outlets in a separate “Outside national reporting denominator” panel. The comparison binds the validated collection configuration and reporting catalog identities, changes no matrix totals, assigns no percentage, and treats missing or mismatched inputs as unavailable rather than an empty list or zero coverage. State-only configuration is explicitly not evidence of acquisition or nationwide completeness.

Repository verification includes 2,841 tests: 2,772 passed, 69 skipped, and zero failed. Live desktop acceptance confirmed both tabs, all four excluded groups, unchanged matrix totals, 200% text size, keyboard access, zero browser page errors, and zero browser non-GET API requests. Lint, web build, desktop build, desktop control-plane, and dependency audit passed. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 80 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 81.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-81 --expected-plan-sha256 6090fd2d6cd71fc4a45a6de588232981a54275735cb23f93c1bfd9b801cde693
```
