# Proposed retained-data production reconciliation — October 6, 2026

Plan 210 is a planning-only successor to Plan 209 after admitting retained Alaska active-business-license conditional-site evidence, migrating exact-ZIP reporting to 49 dimensions, and exposing automatic-refresh authorization decisions in the schedule UI.

- Run ID: `production-cms-directories-20261006-210`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-210.json`
- Plan confirmation SHA-256: `1f05d244aef842509facba46086049670b13c608e245557b08f1ef3ab2f8cb59`
- Plan file SHA-256: `53eea3de64157c39faf7acce30b75a121bb1f1f28750a54efa4c5164faa67987`
- Predecessor plan: `production-cms-directories-20261006-209`
- Implementation commit: the commit containing this document

The pointer-free v2.8 matrix preserves 48,194 ZIP5 rows and contains 49 dimensions and 2,361,506 cells. Its Alaska dimension preserves 4,383 positive ZIPs totaling 94,550 conditional physical sites, 33,528 measured-zero keys inside the retained 37,911-row source denominator, and 10,283 outside-denominator keys as null. The retained source conserves 94,886 source-defined Active license rows as 94,884 provisional organizations and two quarantines; 334 organizations have no eligible conditional site.

This is Alaska-issued source-defined current-license membership. Reported address jurisdiction may differ from licensing jurisdiction. It does not establish present or continuous operation, site occupancy, public access, unique-business identity, completeness, or coordinates. The dimension overlaps `ak_license_location_profiles` and is explicitly nonadditive. Record-level evidence remains local-review-only and aggregate distribution remains local-aggregate-review-required.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 49-dimension lineage. The state release conserves 60 geographic scopes, 48,194 ZIP rows, 49 dimensions, and 2,361,506 cells. Exact reader-to-render and tamper checks enforce Alaska source membership without inventing premise or operational claims.

The refresh-schedule UI now validates and displays the exact automatic-refresh authorization decision for every source matching the selected industry/state scope. It shows unreviewed, governed HOLD, and manual-selection-required reasons; missing, duplicate, stale, or invented decisions fail closed. Because no current source has reviewed automatic-refresh authorization, every applicable automatic schedule scope remains visibly disabled. Manual collection remains separate and unchanged.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 81,046,929,408 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 209 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-210 --expected-plan-sha256 1f05d244aef842509facba46086049670b13c608e245557b08f1ef3ab2f8cb59
```
