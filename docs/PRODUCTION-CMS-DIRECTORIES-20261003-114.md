# Proposed additive CMS directory production — October 3, 2026

Plan 114 is the current clean-repository successor after connecting the D.C. Corporate Registration offline workflow to Co*Tive managed operations.

- Run ID: `production-cms-directories-20261003-114`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-114.json`
- Exact confirmation SHA-256: `cf7432d8ef939bd42d4cf9736ca12c6135fbc0f0aa20e4cb3b84a0db0f6d1f18`
- Plan file SHA-256: `8e623acf22f1767843338bcc5f9bb05456bdc9f4be99c3958d5d093b18a1ca4d`
- Planning repository commit: `d177136`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

Co*Tive can now accept one explicitly selected `data/imports/dc-corporate-registration/packages/<package-id>/selection.json` through its authenticated managed API and Data Operations interface. The operation shares the app's single-operation lifecycle, cancellation, and restart history, independently replays its receipt and release, exposes no private artifacts for download, performs zero network requests, writes no current pointer, and performs no national admission. No real D.C. package was supplied and no D.C. release was created.

A read-only audit of the 40 current broad-organization gap jurisdictions found no retained, verified, legally usable statewide broad-business evidence eligible for offline admission. Twelve adjacent retained cohorts across 11 gap jurisdictions are sector-specific or municipal and close zero broad-layer gaps. Illinois remains the closest operational candidate, but no official five-file package is present and its source-specific scope, status, address-role, refresh, automation, and redistribution gates remain unresolved.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 174,642,765,824 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration suites passed 32/32. TypeScript, targeted ESLint, web and desktop builds, dependency audit, desktop control-plane smoke, and stop/relaunch verification passed. The relaunched collector has exactly one port 4300 listener and returns HTTP 200. The complete repository test suite was not claimed because its long retained-data replay was intentionally stopped after the focused risk-based suites passed.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 113 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 114.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-114 --expected-plan-sha256 cf7432d8ef939bd42d4cf9736ca12c6135fbc0f0aa20e4cb3b84a0db0f6d1f18
```
