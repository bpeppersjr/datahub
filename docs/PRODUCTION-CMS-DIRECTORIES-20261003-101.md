# Proposed additive CMS directory production — October 3, 2026

Plan 101 is the current clean-repository successor after exposing the verified IRS EO non-additive membership through the protected Business Intelligence readiness API and Industry Summary.

- Run ID: `production-cms-directories-20261003-101`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-101.json`
- Exact confirmation SHA-256: `2ff0c40def3dfe4c99945b32b31856b6534ea7f62001b3a09238eb07ad9b2133`
- Plan file SHA-256: `a2f224f4e759b0092c362ef5819917c53b7db63333d5f665e35787cea06b8b54`
- Planning repository commit: `cea5748`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline/geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

Business Intelligence readiness schema 1.2.0 now validates and exposes 1,955,841 exact IRS EIN-to-existing-registry organization memberships, zero missing or extra identities, zero generic-business additivity, 56 jurisdiction aggregates, and 36,950 positive ZIP-evidence rows out of the 48,194-row retained cohort. The view labels these as identifier-free filing-address aggregates and explicitly disclaims physical-site, current-operation, nationwide-completeness, disclosure-control, and USPS-validity claims.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 195,777,318,912 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The combined readiness and workspace suite passed 33/33, TypeScript passed, focused ESLint passed, and diff checks passed after removing a trailing blank line. The previous release's web/desktop builds, desktop smoke, audit, and single-listener runtime evidence remain the latest broad checks; this readiness-only successor has not been represented as a new full repository gate.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 100 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 101.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-101 --expected-plan-sha256 2ff0c40def3dfe4c99945b32b31856b6534ea7f62001b3a09238eb07ad9b2133
```
