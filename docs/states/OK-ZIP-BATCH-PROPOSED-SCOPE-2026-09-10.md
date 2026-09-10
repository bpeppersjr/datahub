# Oklahoma childcare multi-ZIP worker and proposed dispatch scope

## Current status

The standalone multi-ZIP worker is implemented and exercised with synthetic responses. Its native plan independently replays the retained Census inventory and native ZIP-73102 evidence. **Native batch execution has not occurred. No statewide acquisition is approved by this document. The worker is not enrolled in automatic industry runs or the management UI.**

The previous production reconciliation `production-childcare-retained-20260910-01` remains completed and separate. Its approval does not authorize this source acquisition. Likewise, the existing fixed-73102 operation is reused, not relaunched.

## Proposed scope and budgets

The offline plan currently identifies SHA-256 `de0abbd90f30ca83dee5f6a4d8a61c9634a8a2cb1a221034d2426c41c0b9d8ac`. Always regenerate and review the plan before approval: its hash binds ZIP selection, retained evidence, limits, and 24 implementation/dependency files. A source-file or lockfile byte change deliberately changes the required approval hash.

| Item | Bound |
| --- | ---: |
| New center-only ZIP queries | 666 |
| Reused queries | 1 (73102, four internal source candidates) |
| Material Census spatial candidates covered by this query workload | 667 |
| Sliver-only Census candidates deferred for review | 102 |
| Maximum requests | 1,998 (three per new query) |
| Accepted decoded body maximum per response | 1,000,000 bytes |
| Maximum accepted decoded response bytes | 1,998,000,000 bytes (~2.00 GB / 1.86 GiB) |
| Result-file capacity | 4,662,000,000 bytes (~4.66 GB / 4.34 GiB) |
| Required free disk including reserve | 4,930,435,456 bytes (~4.93 GB / 4.59 GiB) |
| Request concurrency | 1 |
| Inter-request gap | At least two seconds after each response |
| Inter-query publisher exclusion gap | Two seconds |
| Per-request timeout / query deadline | 20 / 90 seconds |
| Batch execution deadline | Eight hours |
| Automatic retries | Zero |

These are transfer and **disk storage** bounds, not GB of allocated RAM. The worker handles one ZIP result at a time; verification keeps only lightweight checksums/identities across ZIPs. Plan construction also loads the retained Census relationship inventory. There is no measured or enforced overall process RAM ceiling. The accepted-body bound is not a TCP/wire-byte cap: a rejected overflow chunk may already have arrived before being discarded. The result capacity excludes small intent/plan/receipt files; the 256 MiB disk reserve covers those and overhead at dispatch time, not unrelated future writes by other applications.

Pacing alone takes at least 3,996 seconds (~67 minutes), excluding network, parsing and persistence time; that is a floor, not a completion estimate. A source failure or contract change stops the batch sooner. The response's 100-row ceiling and unknown pagination semantics mean this workload does **not** establish complete statewide business coverage.

## Standalone commands

Read-only plan:

```powershell
node scripts/collect-ok-childcare-zip-batch.mjs plan
```

After a separately recorded scope approval, an operator can invoke `run --output ABSOLUTE_PATH --approved-scope-sha256 SHA256`. The output must be a dedicated directory under datahub's `data`, outside `data/tmp`. A wrong or stale hash fails before any source request. This operator-supplied hash is scope acknowledgment, not publisher permission or independent proof of user authorization.

`inspect --output ABSOLUTE_PATH` independently checks the existing native batch offline and prints aggregate status. Output logs contain receipt references and counts, not business rows. Raw HTML, unknown fields, personal contact fields and credentials are not persisted. Candidates remain internal; public export and national reporting are not enabled.

## Source-use profile

Policy identifier: `ok-public-center-spatial-batch-internal@1.0.0`.

- Publisher and allowed origin: Oklahoma DHS public childcare locator, `https://childcarefind.okdhs.org`.
- Delivery: the published `/providers` center-only ZIP route and the previously reviewed pinned static client. No account, hidden API, map/geocoder, detail-page crawl, redirects, cookies, proxy rotation, or access-alert evasion.
- Evidence basis: [published filter review](OK-CHILDCARE-FILTER-CONTRACT-2026-09-09.md) and [native retained collection](OK-RETAINED-APP-COLLECTION-2026-09-10.md). Those establish a bounded ordinary lookup and field projection, not a blanket bulk license or approved statewide dispatch.
- Intended use: internal business-source assessment with provenance, selected business fields and unknown operating status. User approval of the exact wider workload remains required. No new publisher prohibition or permission is inferred from missing bulk terms.
- Retention: preserve run-scoped selected projections, normalized candidates, query intents and diagnostics. No automated deletion or expiry is introduced. Rejected query bodies are not retained.
- Attribution: each candidate carries publisher source ID, query URL, response hash and observation time. The plan binds geography and the reused bundle.
- Redistribution: disabled; public-export authorization and identity-matching eligibility remain false.

The source's selected fields and types are checked on every response. A private/residential childcare-home row, stale query echo, malformed response, access error, excessive bytes, client hash drift or cancellation stops acquisition. Current operation, address accuracy, identifier lifecycle and complete delivery remain unknown.

## Recovery and concurrency

The worker writes `plan.json`, then one `ZIP.intent.json` **before** each query. Each accepted or rejected query has a separately committed `ZIP.result.json`, with the selected projection, recomputed normalized rows, and request evidence. The final receipt is committed only after offline replay of all results.

- Re-running the same output resumes only a never-issued suffix after verified completed results. A completed output replays without source requests.
- An intent without a result, a rejected result, an unexpected pending file, tampering, or mismatched code/scope requires inspection. It is never automatically retried, even after a restart.
- Starting a different output directory is a new batch, not recovery. This does not provide a global discovery index across every historical batch. Reuse beyond the pinned 73102 bundle and the selected output directory must be explicitly reconciled before a new acquisition.
- A batch-level exclusion prevents concurrent batches. A separate shared publisher exclusion covers both the old fixed-73102 collector and the new ZIP query engine. Synthetic test transports do not make native source requests.
- A crash may leave an exclusion receipt. PID age or absence does not authorize clearing it. Preserve uncertain evidence and inspect the owning run.
- Cancellation preserves committed results. An accepted result not yet committed when cancellation occurs may leave an intent or pending file that requires inspection; cancellation is not rollback.

The existing generic app collection route can provide a future handoff without a new server endpoint, but its child receives only `--output`. A scope-approved adapter and source enrollment are still needed before a managed app dispatch. Generic supervisor success alone will not establish source completeness or active-business status.

## Verification and rollback

Eleven focused tests pass with the native retained-inventory flag enabled. They cover multi-ZIP ordering, unknown/capped/empty response semantics, ZIP4 separation, address/query disagreement, privacy projection, rejected requests, cancellation, byte/client drift, completed replay, never-issued suffix resume, concurrent execution, publisher exclusion, stale approval rejection, and cross-file mutation before resume.

Full `npm run check` passed on September 10: 1,760 tests, 1,749 passed, 11 explicitly skipped, zero failures. Lint, web/desktop builds and desktop control-plane smoke passed. The available PDF, IA reporting, retained-cohort, Overture runtime and Oklahoma inventory native-test flags were enabled. Log: `data/tmp/ok-zip-batch-check.log`. Separate `npx tsc --noEmit` passed; `npm audit --omit=dev` reported zero vulnerabilities. The plan hash was regenerated after these checks and still matched the proposed hash above.

Native collection, throughput and management handoff remain unverified. No production pointers or business data were promoted. Rollback removes the additive successor modules/CLI and restores the fixed collector's former wrapper if necessary; do not delete retained source evidence or clear active exclusions as part of code rollback.
