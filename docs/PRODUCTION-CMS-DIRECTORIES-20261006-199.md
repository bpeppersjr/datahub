# Proposed retained-data production reconciliation — October 6, 2026

Plan 199 is a planning-only successor to Plan 198 after three governed local-only additions: state-level operational industry status, Census ZIP Business Patterns 2023 all-industry employer-establishment evidence, and a pointer-free non-ZCTA source-geography context release.

- Run ID: `production-cms-directories-20261006-199`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-199.json`
- Plan confirmation SHA-256: `6e2dd3e8c8f0f08d9399954d46b7eb341083b5287235a4f51f57091002de0edc`
- Plan file SHA-256: `ed13565726a655cdaee0c4b95e4c73410a0e06630fd4444542a9a4986975dc5d`
- Predecessor plan: `production-cms-directories-20261006-198`
- Implementation commit: the commit containing this document

Industry Status now conserves all 459 operational industry/state cells: 51 named state rows for each of nine maintenance segments. Each row reports the enrolled access and temporal status plus report-native source keys, retained release identifiers, reference dates, review dates, and evidence scope when present. Client validation requires the exact taxonomy, closed vocabularies, report pin, state uniqueness, aggregate-to-state conservation, claims, and no extra fields. These are source-access and temporal-review measures, not business counts or completeness percentages.

The adjacent exact-ZIP evidence catalog now independently replays Census ZBP 2023 alongside the existing Minnesota credential and pharmacy non-primary-address projections. ZBP contributes 37,828 ZIP status rows: 34,954 published all-industry employer-establishment aggregate rows and 2,874 ZCTA-only rows that remain unmeasured. It uses only the direct publisher `------` row and never sums the NAICS hierarchy. Census reference-year aggregates do not prove named or currently operating businesses, physical sites, geocodes, all-business completeness, GDP, or matrix admission.

The pointer-free non-ZCTA context release contains exactly 14,402 cohort keys in 100 ZIP2 partitions. Retained business-geography relationships provide source-reported code context for 8,871 keys; 5,531 remain without profile evidence. The release makes no ZIP-to-state assignment and no cardinal, polygon, centroid, USPS-class, USPS-validity, park, tribal or Native territory, private-land, population, or business-completeness claim. It is not integrated into heatmap or state denominators and cannot block the map.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 89,855,741,952 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable pointer change, national matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 198 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-199 --expected-plan-sha256 6e2dd3e8c8f0f08d9399954d46b7eb341083b5287235a4f51f57091002de0edc
```
