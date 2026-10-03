# Proposed additive CMS directory production — October 3, 2026

Plan 119 is the current clean-repository successor after adding durable standalone application workflows for the Utah and Oklahoma offline business-package contracts.

- Run ID: `production-cms-directories-20261003-119`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-119.json`
- Exact confirmation SHA-256: `b8bcd0b535902046791edcb5db8bf8d86ea0515db5f318bc5597e15e224f8ef9`
- Plan file SHA-256: `70191ce24a8025b2fb2db2a18dac7962676fc29281d37c3944d31aae32b69306`
- Planning repository commit: `556f48e`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

Utah and Oklahoma now each have a fixed-root standalone offline worker with UUID-scoped operations, durable start and terminal receipts, operation-owned input snapshots and releases, cooperative cancellation, owned failure cleanup, and independent receipt/release replay. The workers cannot discover, acquire, purchase, or contact sources and cannot mutate current or national pointers.

The Utah worker preserves explicit false source-native, authenticity, reproducible-extraction, and admission-eligibility claims. The Oklahoma worker preserves administrative-address-only, no-physical-site, and no-current-operation claims. Both outputs remain local-review-only. No real package or operation was created for either state, and neither state is admitted to broad coverage.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 171,461,787,648 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused base, app-wrapper, and connector-registry suites passed 26/26. TypeScript, targeted ESLint, dependency audit, desktop control-plane smoke, and stop/relaunch verification passed. The relaunched collector has exactly one port 4300 listener and returns HTTP 200. The connector registry now contains 98 connectors and 75 policy profiles.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 118 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 119.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-119 --expected-plan-sha256 b8bcd0b535902046791edcb5db8bf8d86ea0515db5f318bc5597e15e224f8ef9
```
