# Proposed additive CMS directory production — October 3, 2026

Plan 113 is the current clean-repository successor after adding offline broad-source admission paths.

- Run ID: `production-cms-directories-20261003-113`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-113.json`
- Exact confirmation SHA-256: `f921f9a2e8359d3f22221664543f53fffac0f5e0828c15ed8d53558272c24d9e`
- Plan file SHA-256: `c568516667ed429ded46bbaaf718041bcce70630bf8868a2a9fdda8e9b327c50`
- Planning repository commit: `d849c04`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The new Alaska admission candidate independently replayed all 22 retained artifacts totaling 66,915,538 bytes and conserved 94,886 source rows into 94,884 provisional organizations plus two quarantined rows. It is pointer-free and does not assert current operation, verified sites, geocodes, ownership, or all-business completeness.

The D.C. Corporate Registration app workflow can process only an explicitly selected closed local package into an operation-scoped local-review release. A generic state-package verifier additionally provides a read-only, fail-closed contract for future authorized inputs; it cannot replace source-specific authorization or publish/admit data. No real D.C. package was supplied and no D.C. release was created.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 174,730,326,016 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration tests passed 39/39 before adversarial hardening; final focused suites passed Alaska 6/6, D.C. 6/6, and generic state-package 9/9. Connector registry, control-plane security, TypeScript, targeted ESLint, web and desktop builds, dependency audit, desktop control-plane smoke, and stop/relaunch verification passed. The relaunched collector has exactly one port 4300 listener and returns HTTP 200.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 112 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 113.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-113 --expected-plan-sha256 f921f9a2e8359d3f22221664543f53fffac0f5e0828c15ed8d53558272c24d9e
```
