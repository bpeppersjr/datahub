# Proposed additive CMS directory production — October 3, 2026

Plan 107 is the current clean-repository successor after simplifying Co*Tive Collector into a more focused tab-based interface for state completion, industry connectivity, and ZIP economic readiness.

- Run ID: `production-cms-directories-20261003-107`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-107.json`
- Exact confirmation SHA-256: `bfa4755d9b1ce0871723f38b018f75cc65242fbac8733367de1f883b4fe5ab24`
- Plan file SHA-256: `7149b1c93d754d1a1be7654390891264de82af847a5188156f60810b8f6853e9`
- Planning repository commit: `54f415c`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The application now keeps the primary State Completion, Industry Summary, ZIP & GDP, and Operations workspaces. Industry Summary has focused Overview, Connectivity, and State map sub-tabs. The state map remains paired with a right-hand state detail panel. Dataset availability, retained evidence shares, and Census aggregates remain separately labeled; none is represented as all-business completeness or GDP completeness. ZIP GDP, industry GDP allocation, and demographic GDP remain unavailable pending governed model and input approval.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 187,936,305,152 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The focused UI suites passed 30/30. TypeScript, ESLint, diff checks, production and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. The relaunched collector has exactly one port 4300 listener; unauthenticated health access returned the expected HTTP 401 authentication boundary.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 106 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 107.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-107 --expected-plan-sha256 bfa4755d9b1ce0871723f38b018f75cc65242fbac8733367de1f883b4fe5ab24
```
