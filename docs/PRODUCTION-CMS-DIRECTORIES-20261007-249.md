# Proposed retained-data production reconciliation — October 7, 2026

Plan 249 supersedes planning-only Plan 248 after enrolling the standalone California childcare operation in Co*Tive's governed industry-source catalog. Production inputs and authorization remain unchanged. This plan does not authorize or perform production work.

- Run ID: `production-cms-directories-20261007-249`
- Plan confirmation SHA-256: `7aea25547984d4e5db27d20adf880f1751879f71b04d4e0c7013914f0b3a422a`
- Plan file SHA-256: `8e491e5427cbf4f9aea908c3e2a8cb98de3a4b71948285f00434693e2031bee8`
- Predecessor plan: `production-cms-directories-20261007-248`
- Industry-source catalog SHA-256: `b2990730bca245230e3567222f61980487de3d9204d3b9c04921957d92933dac`
- Automatic-refresh authorization SHA-256: `066877e36283bba597bdda51a759ca875a37b382e230a20c1331cc8d1007a9ed`

The childcare industry now contains 13 governed source tasks, including `state-ca-childcare`. A California/childcare plan selects exactly the durable California app worker, checks its application, acquisition, and source-policy prerequisites, records other selected states as explicit gaps, and carries its privacy, temporal, postal, normalization, and reporting limitations into the durable plan and receipt.

Co*Tive's authenticated Collection workspace obtains this source through the existing governed catalog and preview flow. An operator may explicitly select and dispatch the California task; default state/industry planning includes it only when California childcare is in scope. This enrollment does not start a download by itself.

Automatic refresh remains denied with `AUTOMATIC_REFRESH_NOT_REVIEWED`. No recurring schedule, retry, restart, normalization, national admission, public export, or source-pointer mutation is enabled. Retained-input reuse remains available through the standalone operation to avoid repulling already verified evidence.

Focused tests passed for source-catalog conservation, California-only planning, cross-state gaps, prerequisite binding, warning propagation, manual collection planning, schedule denial, managed-operation behavior, and Collection UI source selection. Connector validation, lint, and both web and desktop builds pass. No live provider request or provider-row acquisition occurred.

Read-only production preflight returned `READY`, revalidated every production pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. The four retained selections and `national-12g` profile remain pinned. Available disk was 73,641,652,224 bytes against a 13,309,329,011-byte requirement.

No production reconciliation, California provider request, provider-row acquisition, normalization, production enrollment, public export, or mutable source pointer write occurred. Plan 248 and earlier plans are superseded without execution. Any production execution requires later explicit approval naming this exact run ID and confirmation SHA-256.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261007-249 --expected-plan-sha256 7aea25547984d4e5db27d20adf880f1751879f71b04d4e0c7013914f0b3a422a
```
