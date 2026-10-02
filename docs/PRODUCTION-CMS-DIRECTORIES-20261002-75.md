# Proposed additive CMS directory production — October 2, 2026

**Superseded without execution by Plan 76 after retained state-catalog reconciliation. Do not execute or approve Plan 75.**

Plan 75 is the current clean-repository successor after source-bound entity-resolution replay verification was implemented, tested against tampering, executed against the retained national releases, committed, and pushed.

- Run ID: `production-cms-directories-20261002-75`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-75.json`
- Exact confirmation SHA-256: `aa7fcf210bcc82988ebda805d20da2e77f22e4b7c19c32757058ec527601ff07`
- Plan file SHA-256: `8997fe5726ccb8595810c1061b701d70ccd2ed6db9c63e1c0c020c793b6c0f51`
- Planning repository commit: `aafe037f9d5985accb1f530f2a5f8075aec847d3`
- Source-replay verifier commit: `aafe037f9d5985accb1f530f2a5f8075aec847d3`
- Created: `2026-10-02T09:32:20.345Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 239,413,555,200 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The source-bound verifier revalidated registry release `national-business-registry-20260911-022652067Z-1ec656c3` and reproduced the complete retained resolution `business-entity-resolution-20260911-040411512Z-e6812503`: 8,011,835 profiles and 2,578,153 decisions across all 100 ZIP2 partitions. It binds exact manifest bytes, hashes the gzip bytes it consumes, rejects linked-path escape, preserves reporting-only exclusions, and detects omitted decisions even when derivative hashes, counts, and summaries are consistently rewritten.

Verification supporting this plan includes 2,827 repository tests: 2,758 passed, 69 skipped, and zero failed. Discovery, assessment, connector, lint, web-build, desktop-build, and desktop control-plane gates passed. The production dependency audit reported zero vulnerabilities. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 74 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 75.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-75 --expected-plan-sha256 aa7fcf210bcc82988ebda805d20da2e77f22e4b7c19c32757058ec527601ff07
```
