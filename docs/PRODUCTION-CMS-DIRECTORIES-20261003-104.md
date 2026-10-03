# Proposed additive CMS directory production — October 3, 2026

Plan 104 is the current clean-repository successor after exposing the selected governed ZCTA demographic-input readiness release through the authenticated Co\*Tive API and the tab-focused ZIP & GDP Demographics view.

- Run ID: `production-cms-directories-20261003-104`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-104.json`
- Exact confirmation SHA-256: `b34bea55db26a62ca5f746b716937216830808091942dc98fb58e5381bf49094`
- Plan file SHA-256: `5e48dfbe3c408709f90e4e9d4ec6fe5cb796a3c3722abe708ee3c5636cfdd703`
- Planning repository commit: `bb22b50`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline/geographic inputs, childcare, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The new ZCTA demographic-readiness endpoint verifies the selected release registration, manifest and artifact hashes, all 33,791 sorted unique rows, and stable file identity before returning a closed view. The UI exposes only direct 2020 population and housing-unit context and the explicit blockers for race, ancestry/lineage, sex, and age. It does not represent ZCTA as an official USPS ZIP, fabricate demographic percentages, or allocate GDP. The current reader verifies and scans the 13.7 MB artifact per request; a bounded registered lookup index remains future work.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 190,347,743,232 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The combined demographic backend and UI regression set passed 46 tests with one Windows symlink-permission skip. TypeScript, focused ESLint, diff checks, production and desktop builds, desktop control-plane smoke, and the stop/relaunch lifecycle passed. The relaunched collector returned HTTP 200 with exactly one port 4300 listener.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 103 and all earlier plans or approvals are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 104.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-104 --expected-plan-sha256 b34bea55db26a62ca5f746b716937216830808091942dc98fb58e5381bf49094
```
