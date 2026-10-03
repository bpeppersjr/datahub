# Proposed additive CMS directory production — October 3, 2026

Plan 110 is the current clean-repository successor after adding the governed state-gap adjacent-evidence index and the bounded exact-ZIP industry/Census aggregate cross-view to Co*Tive Collector.

- Run ID: `production-cms-directories-20261003-110`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-110.json`
- Exact confirmation SHA-256: `2921d218107a81c84f96229d6f0ba52d50b4e2182745d4df58847808317a1b54`
- Plan file SHA-256: `d551066db2ecedb5ac9e7edcd8cc862fec9fc85b7e9a6c9c3f57434d4e266065`
- Planning repository commit: `a8df4ef`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The adjacent-evidence index covers all 40 current broad-layer gap jurisdictions. Eleven have 12 retained state, local, license, credential, or childcare cohorts; 29 explicitly have no retained adjacent cohort in the index. Zero broad gaps are closed. These counts remain outside the broad-organization denominator and are not all-business completeness.

The ZIP cross-view combines the nine-source exact-ZIP evidence row with 2020 Census population and housing only for an exact same-code governed ZCTA. It computes no ratios, cross-industry total, demographic shares, allocation weights, numeric GDP, or USPS-validity claim. ZIP+4 remains separate.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 185,080,504,320 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Focused integration suites passed 54/54. TypeScript, ESLint, web and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. The relaunched collector has exactly one port 4300 listener.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 109 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 110.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-110 --expected-plan-sha256 2921d218107a81c84f96229d6f0ba52d50b4e2182745d4df58847808317a1b54
```
