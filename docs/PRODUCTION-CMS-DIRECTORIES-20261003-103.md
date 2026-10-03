# Proposed additive CMS directory production — October 3, 2026

Plan 103 is the current clean-repository successor after registering ACS ZCTA demographic prerequisite inspection as an explicit offline-only Co*Tive connector.

- Run ID: `production-cms-directories-20261003-103`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-103.json`
- Exact confirmation SHA-256: `024a8d8750a581e6323dbe40e8917efee22066590b9cbf3dbd4ecdee223d375e`
- Plan file SHA-256: `6126caa4749e416482e38edf487887065e7ededf6f9e6a5f8a4a977db885aa5f`
- Planning repository commit: `fa9080a`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline/geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The connector registry now contains 92 connectors and 73 distinct source-policy profiles. `acs-zcta-demographic-admission` exposes the implemented read-only prerequisite inspection and one-row closed-schema validator with no hosts, secrets, network requests, durable receipts, publication, or production admission. Its contract lists the exact pinned prerequisite inputs, 33,791-row geography replay boundary, 189 base variables, byte and line ceilings, and disabled acquire/publish lifecycle stages. The four substantive blockers remain unchanged.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 190,789,709,824 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Connector registry checks passed. The ACS, registry, and authenticated control-plane suites passed 17/17; TypeScript, focused ESLint, and diff checks passed. This registration-only successor has not been represented as a new full repository gate.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 102 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 103.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-103 --expected-plan-sha256 024a8d8750a581e6323dbe40e8917efee22066590b9cbf3dbd4ecdee223d375e
```
