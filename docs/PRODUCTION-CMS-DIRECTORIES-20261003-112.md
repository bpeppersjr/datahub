# Proposed additive CMS directory production — October 3, 2026

Plan 112 is the current clean-repository successor after simplifying Co*Tive into four primary tab-focused workspaces and adding fail-closed, application-owned offline admission foundations for USPS City State and Illinois business-registry packages.

- Run ID: `production-cms-directories-20261003-112`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-112.json`
- Exact confirmation SHA-256: `c70e58e9a2c993f7b922d7420d33f5e62b8d8b04a76a5d2668fe7a845bfa3a92`
- Plan file SHA-256: `1bb301e64ecfee7d83bed52035830713ba8cfa8382b946b3f453ebccac2371d3`
- Planning repository commit: `39571c7`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The application now leads with persistent `State Completion`, `Industry Summary`, `ZIP & GDP`, and `Operations` tabs. State/category availability remains separate from all-business completeness. The ZIP workspace exposes observed evidence and governed model readiness while numeric ZIP GDP, industry allocations, and race, lineage/ancestry, sex, and age GDP slices remain unavailable until their source inputs and model are approved.

The USPS City State admission remains closed because its authorization and projection-schema registries are empty. The Illinois workflow accepts only an explicitly selected local five-file package and creates operation-scoped snapshots and receipts. Neither workflow performed acquisition, networking, production enrollment, or pointer mutation while preparing this plan.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 176,997,715,968 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused UI tests passed 35/35. Focused USPS admission tests passed 4/4, control-plane security passed 3/3, and Illinois plus connector-registry tests passed 12/12. TypeScript, ESLint, web and desktop builds, desktop control-plane smoke, `git diff --check`, and `npm audit --omit=dev` passed. The broad repository test run was interrupted during long retained-data replay; its only observed failures were caused by an empty FMCSA test lock left by interruption, which was inspected and removed. The relaunched collector has exactly one port 4300 listener and returns HTTP 200.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 111 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 112.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-112 --expected-plan-sha256 c70e58e9a2c993f7b922d7420d33f5e62b8d8b04a76a5d2668fe7a845bfa3a92
```
