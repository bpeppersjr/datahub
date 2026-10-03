# Proposed additive CMS directory production — October 3, 2026

Plan 117 is the current clean-repository successor after connecting the existing Illinois Business Registry offline processor to Co*Tive managed operations.

- Run ID: `production-cms-directories-20261003-117`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-117.json`
- Exact confirmation SHA-256: `3f415cf13b6b1e4621b893673e4b952c761dd79a075e1bf65e0d7d22ac21b823`
- Plan file SHA-256: `083733a0bb1b5f14e931a5cd1f363cb930c032b6264e2073bd6bea4a0f6dd56b`
- Planning repository commit: `bcd5455`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

Co*Tive can now accept one explicitly selected `data/imports/illinois-business-registry/packages/<package-id>/selection.json` through its authenticated managed API and Data Operations interface. The package must contain all five official corporation and LLC files from one daily run. The operation shares the app's single-operation lifecycle, cancellation, and restart history, independently replays its receipt and release, exposes no private artifacts for download, performs zero network requests, writes no current pointer, and performs no national admission. Results remain local-review-only.

No official Illinois package was supplied, no Illinois operation was executed, and no Illinois release was created. Illinois remains a current broad-layer gap until its outstanding authorization gates are resolved, an exact package is supplied and verified, and a separate national admission is reviewed and approved.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 173,063,290,880 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused Illinois, managed-operation, security, connector, and UI suites passed 25/25. TypeScript, targeted ESLint, web and desktop builds, dependency audit, desktop control-plane smoke, and stop/relaunch verification passed. The relaunched collector has exactly one port 4300 listener and returns HTTP 200.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 116 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 117.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-117 --expected-plan-sha256 3f415cf13b6b1e4621b893673e4b952c761dd79a075e1bf65e0d7d22ac21b823
```
