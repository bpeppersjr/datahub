# Proposed retained-data production reconciliation — October 6, 2026

Plan 203 is a planning-only successor to Plan 202 after reconciling public temporal reporting, expanding the governed exact-ZIP industry matrix and runtime views to 42 dimensions, and updating national Industry Status without changing the historical state heatmap lineage.

- Run ID: `production-cms-directories-20261006-203`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261006-203.json`
- Plan confirmation SHA-256: `8632596c3a9cfe75797c9de72ad9160faefa011eebcef87d04d1e41411957b77`
- Plan file SHA-256: `144db3342102959071189b0b5f3bb93d20695d0db586911e81e6e467867c8be2`
- Predecessor plan: `production-cms-directories-20261006-202`
- Implementation commit: the commit containing this document

The public temporal view now leads with the authoritative effective classification: 21 source-defined-current, seven non-active reporting, one annual aggregate, and one unknown source. The publisher's original 22/7/1 source cohort remains visible only as provenance. Los Angeles is the one explicit mismatch, with 633,232 profiles retained as unknown because source status is null. Active-business count and completeness remain null, and current operation remains unverified.

The pointer-free exact-ZIP v2.1 matrix preserves 48,194 exact ZIP5 rows and contains 42 dimensions and 2,024,148 evidence cells. In addition to the admitted Minnesota construction dimension, it adds 420 provider-reported pharmacy non-primary address rows across 377 cohort ZIP5 keys. ZIP+4 remains separate metadata and is never joined to ZIP5. These records do not assert current operation, physical sites, unique businesses, complete pharmacy coverage, USPS validity, or additive counts.

The protected selected-ZIP endpoint and ZIP Economics view now use a bounded v2.1 reader that verifies the selected prefix and governed sidecars without replaying the full matrix. National Industry Status uses a separately registered 42-dimension aggregate successor. Historical v1.9/v2.0 verification remains reproducible. The state heatmap retains its separately registered 40-dimension historical rollup and is not relabeled as 42 dimensions.

Administration retains its separate nine operational maintenance segments and grants no acquisition authority. The application does not require an all-business denominator, universal geocodes, or full industry completeness to report governed evidence status.

Read-only exact-plan preflight returned `READY`, revalidated every pin, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 87,511,601,152 bytes against a 13,309,329,011-byte requirement.

No source acquisition, network request, candidate stage, production stage, mutable production pointer change, national production matrix publication, or production enrollment occurred. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 202 and all earlier plans or approvals are superseded without production execution.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261006-203 --expected-plan-sha256 8632596c3a9cfe75797c9de72ad9160faefa011eebcef87d04d1e41411957b77
```
