# Proposed retained-data production reconciliation — October 6, 2026

Plan 209 is a planning-only successor to Plan 208 after admitting retained City of Los Angeles location-account evidence, migrating exact-ZIP reporting to 48 dimensions, strengthening state-map geography validation, and closing an automatic-refresh authorization bypass.

- Run ID: `production-cms-directories-20261006-209`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-209.json`
- Plan confirmation SHA-256: `86af0e3834773ed1c2d9a101728d2479309e5de56bf5e447ecaf0b44bbbc9882`
- Plan file SHA-256: `9dd61caa58b24575f422bc502623776e1f704a8400d4667c074f57150696ee87`
- Predecessor plan: `production-cms-directories-20261006-208`
- Implementation commit: the commit containing this document

The pointer-free v2.7 matrix preserves 48,194 ZIP5 rows and contains 48 dimensions and 2,313,312 cells. Its City of Los Angeles dimension preserves 5,371 positive ZIPs totaling 633,232 normalized municipal location-account sites, 32,457 measured-zero keys inside the retained source denominator, and 10,366 outside-denominator keys as null. The retained source conserves 633,782 accounts as 633,232 normalized sites and 550 quarantines, with 566,858 source-geocoded locations.

This is municipal publisher-list membership, not statewide California coverage. Retained rows carry null source status, so their lifecycle remains `unknown-source-status`; no current or continuous operation, unique-business, all-business completeness, or USPS-validity claim is made. The dimension overlaps `la_registered_location_profiles` and is explicitly nonadditive. Record-level evidence remains local-review-only.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 48-dimension lineage. The state release conserves 60 geographic scopes, 48,194 ZIP rows, 48 dimensions, and 2,313,312 cells. Client validation now requires every state/DC row exactly once and binds state, territory, and special-scope denominators to the registered geography totals before rendering.

Correcting the stale Los Angeles dataset registration required a new pointer-free source-policy provenance successor. It preserves 15 sources, 8,011,835 profiles, temporal schema v1.2 lineage, and false authorization, acquisition, current-operation, active-eligibility, production-enrollment, and pointer-write claims.

Automatic refresh now fails closed against a 27-source authorization roster. No current source has reviewed automatic-refresh authorization. Oklahoma remains manual-only; Washington and Texas aliases are canonically bound to their governed HOLD sources and cannot bypass those holds. Schedule restore, creation, enablement, due-time planning, and pre-allocation dispatch all revalidate authorization. Manual collection behavior remains separate and unchanged.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 81,933,025,280 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 208 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-209 --expected-plan-sha256 86af0e3834773ed1c2d9a101728d2479309e5de56bf5e447ecaf0b44bbbc9882
```
