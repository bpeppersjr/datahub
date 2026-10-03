# Proposed additive CMS directory production — October 3, 2026

Plan 109 is the current clean-repository successor after publishing the compact temporal-status upgrade for the national exact-ZIP cross-industry evidence matrix.

- Run ID: `production-cms-directories-20261003-109`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-109.json`
- Exact confirmation SHA-256: `fc13d7581807019230c8f4d2472361175ce07bcddd653f862f0256ada2acd725`
- Plan file SHA-256: `3aca621c5cc6591b9388b99c5716e1920bef143c8f6dfeca81d50a48f28485cd`
- Planning repository commit: `fb7c9d0`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The exact-ZIP matrix contains 48,194 ZIP5 evidence rows across nine national source layers, or 433,746 source-specific cells. Each cell now exposes its source reference date and explicitly records that current operation is unverified. Source-level temporal semantics and manifest provenance are stored once per source. The compact release is 146,066,289 artifact bytes. The layers remain nonadditive; ZIP+4 remains separate, USPS validity remains unknown, and no all-business completeness is asserted.

The Co*Tive interface remains organized into four primary workspaces: State Completion, Industry Summary, ZIP & GDP, and Operations. State Completion is the default heat-map view with selected-state detail beside the map. Industry Summary separates overview, connectivity, and state-map questions. ZIP & GDP separates total-model readiness, source-specific business segments, and demographic cross-views. GDP remains on `HOLD`; no numeric ZIP, industry, or demographic GDP output is shown without approved governed inputs and model authorization.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 186,177,933,312 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration suites passed 38/38. TypeScript, ESLint, production and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. The relaunched collector has exactly one port 4300 listener.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 108 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 109.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-109 --expected-plan-sha256 fc13d7581807019230c8f4d2472361175ce07bcddd653f862f0256ada2acd725
```
