# Proposed additive CMS directory production — October 2, 2026

Plan 74 is the current clean-repository successor after the category-scoped Coverage workspace implementation and the retained-source reconciliation history were committed and pushed.

- Run ID: `production-cms-directories-20261002-74`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-74.json`
- Exact confirmation SHA-256: `09fcb8bbbc8dd96d0805acae651a6e3395a7fcb560843a4ac3fcd47fdd8ef631`
- Plan file SHA-256: `251219e53b50ce05647447239cbfe9cd18de73ba78c2b7f04a3e0728d8ec557c`
- Planning repository commit: `6309512e2f3014e07dbeb04992368a9b4d3af7dc`
- Coverage workspace commit: `6309512e2f3014e07dbeb04992368a9b4d3af7dc`
- Created: `2026-10-02T08:45:14.423Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 233,451,925,504 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Verification supporting this plan includes 2,825 repository tests: 2,756 passed, 69 skipped, and zero failed. Discovery, assessment, connector, lint, web-build, desktop-build, and desktop control-plane gates passed. The production dependency audit reported zero vulnerabilities. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

Rendered desktop acceptance proved that Coverage defaults to the explicitly labeled `Broad state organization layer`, can switch to `Health care`, renders 51 state/D.C. paths, updates the right-side state summary, and keeps `All-business completeness: Unknown` visible. Availability remains scoped to the selected reporting category; no category percentage is presented as business-universe completion.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 73, Plan 72, and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 74.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-74 --expected-plan-sha256 09fcb8bbbc8dd96d0805acae651a6e3395a7fcb560843a4ac3fcd47fdd8ef631
```
