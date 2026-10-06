# Proposed retained-data production reconciliation — October 6, 2026

Plan 208 is a planning-only successor to Plan 207 after admitting the retained Texas active sales-tax permitted-outlet aggregate, migrating exact-ZIP reporting to 47 dimensions, reconciling the Texas dataset registration and source-policy provenance, and connecting Administration maintenance intent to disabled-first refresh-schedule planning.

- Run ID: `production-cms-directories-20261006-208`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-208.json`
- Plan confirmation SHA-256: `c2ec904fa966c62beea776cca736a94a3ce6af96a24f4db48b7bd7e5441337b9`
- Plan file SHA-256: `7a32be318ff0047362accf9712a2d0461b6e90c34835f9f68b7ffcb5fef9dcee`
- Predecessor plan: `production-cms-directories-20261006-207`
- Implementation commit: the commit containing this document

The pointer-free v2.6 matrix preserves 48,194 ZIP5 rows and contains 47 dimensions and 2,265,118 cells. Its Texas active sales-tax permitted-outlet dimension preserves 2,156 positive ZIPs totaling 885,097 normalized outlet sites, 35,672 measured-zero keys inside the retained source denominator, and 10,366 outside-denominator keys as null. The retained source conserves 885,278 rows as 885,097 normalized outlets and 181 quarantines associated with 700,705 source-defined taxpayers.

Publisher `Active` is snapshot status only. It does not establish continuous operation, unique businesses, verified public access, Texas all-business completeness, or an additive business count. This dimension overlaps the existing Texas sales-tax outlet profile dimension and is explicitly nonadditive. Record-level publication remains local-review-only.

The protected ZIP view, national Industry Status, state disposition release, heatmap, state panel, and goal-readiness authority now use the 47-dimension lineage. The state release conserves 60 geographic scopes, 48,194 ZIP rows, 47 dimensions, and 2,265,118 cells. Private or special-purpose ZIPs, missing Census population, and non-ZCTA or unresolved geography remain visible unknowns and do not block the existing Census geography map.

The corrected Texas dataset registration required a new pointer-free source-policy provenance successor. It preserves 15 sources and 8,011,835 profiles, temporal schema v1.2 lineage, and false authorization, acquisition, current-operation, active-eligibility, production-enrollment, and pointer-write claims.

Administration maintenance intent now initializes the new-refresh-schedule industry selection and can be restored with **Use Administration selection**. It never creates or enables a schedule automatically. State selection remains explicit, new schedules remain disabled-first, and connector authorization, policy, overlap, and execution gates remain unchanged.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 82,787,045,376 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 207 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-208 --expected-plan-sha256 c2ec904fa966c62beea776cca736a94a3ce6af96a24f4db48b7bd7e5441337b9
```
