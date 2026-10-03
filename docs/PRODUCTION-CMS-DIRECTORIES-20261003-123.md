# Proposed additive CMS directory production — October 3, 2026

Plan 123 is the current clean-code successor after the Co*Tive workspace redesign, the corrected Kansas official-source assessment, and the governed Mississippi Business Reports offline review contract.

- Run ID: `production-cms-directories-20261003-123`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-123.json`
- Exact confirmation SHA-256: `2755bc14ea1c46aa1fed1a78cd93ee67f7a0155fa9feb50956160192fe7e7960`
- Plan file SHA-256: `50bb6c1d2d02757ac4025a2094cfbe5cd94fed89ddce38a622eb1b79694f311e`
- Planning repository commit: `42fd1286a57654da55a0858812d5d69e820ccc38`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The Mississippi connector added before this plan is an offline, operator-supplied review contract only. It requires a hash-bound original XLS/XLSX file and operator-derived JSONL, keeps ZIP5 and ZIP4 separate, and preserves false claims for source authenticity, reproducible extraction, statewide completeness, current operation, physical sites, redistribution, national admission, production enrollment, and pointer mutation. It does not process a package in this plan. The Kansas correction remains HOLD and authorizes no acquisition or connector.

Focused Mississippi and Kansas tests, the state-source assessment catalog check, connector registry check, targeted lint, and scoped diff checks passed. The preceding UI change also passed its 35 focused tests, web and desktop builds, dependency audit, desktop control-plane smoke, and stop/relaunch recovery.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 169,203,240,960 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 122 was generated before the final Mississippi governance hardening and is superseded without execution; Plan 121 and all earlier plans or approvals are also superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 123.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-123 --expected-plan-sha256 2755bc14ea1c46aa1fed1a78cd93ee67f7a0155fa9feb50956160192fe7e7960
```
