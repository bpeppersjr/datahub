# Vermont childcare: SODA3 delivery review — September 8, 2026

Documentation review only. No Vermont provider rows, IDs, exports or additional publisher requests were made; the denied DCF surface was not retried. This supplements the [fresh metadata and aggregate evidence](VT-CHILDCARE-METADATA-2026-09-08.md), not an acquisition-ready declaration.

## Verified vendor contract and limits

The [dataset-specific API Foundry](https://dev.socrata.com/foundry/data.vermont.gov/ctdw-tmfz) identifies `https://data.vermont.gov/api/v3/views/ctdw-tmfz/query.json`. Its generated examples mix clients and API generations; they are not a substitute for a versioned delivery test. The repository's existing native aggregate observations establish that GET with URL-encoded `query`, `pageNumber=1` and bounded `pageSize` worked anonymously for this endpoint at those times. They do not prove facility pagination or future anonymous availability.

The [SODA3 query documentation](https://dev.socrata.com/docs/queries/) recommends POST with JSON `query` and `page: {pageNumber, pageSize}`. Page numbers are one-based. It distinguishes query pagination from whole-dataset export and documents system/synthetic columns as enabled by default. Thus a future selected-field reader must explicitly reject unexpected response columns, regardless of its SQL projection. The documented server timeout defaults to 600 seconds; that is not a suitable local connector deadline. The general SODA3 page does not comprehensively specify the equivalent GET option encoding, a maximum page size, or a truncation sentinel. Do not import legacy `$limit`/`$offset`, 50,000-row limits or default-page assumptions into this contract.

The dedicated [page option](https://dev.socrata.com/docs/queries/page) maps page 5 at size 10 to rows 41–50 and says paging imposes consistent ordering. It warns that high page numbers become slow. The [orderingSpecifier documentation](https://dev.socrata.com/docs/queries/orderingspecifier) explains that paged queries receive a total order consistent with declared/inherited ordering; `discard` removes ordering constraints. Keep explicit source-key ordering and never request `discard`. This is an ordering guarantee, not a documented immutable snapshot across source updates. Do not infer publisher collation by comparing text keys using JavaScript ordering.

Authentication guidance is not fully consistent: the SODA3 query overview requires user authentication or a valid application token, while the [application-token page](https://dev.socrata.com/docs/app-tokens.html) describes anonymous queries sharing an IP-based throttling pool. It identifies HTTP 429 as throttling and `X-App-Token` as the SODA3 token header; tokens are not necessarily authentication. No numeric anonymous quota or guaranteed `Retry-After` behavior was established. Vermont's successful anonymous aggregates are narrower empirical evidence, not permission to obtain credentials, evade denial or assume unlimited requests. A future anonymous connector should stop with a finite deferred/denied receipt on 429/401/403, with no token acquisition, alternate endpoint or retry loop.

## Proposed bounded acceptance contract

These are implementation recommendations, not additional claims about publisher behavior:

- Freeze the exact center predicate and selected non-contact schema from the preflight. Preserve reporting-file identity and monthly cohort semantics; do not use person IDs as business keys or jittered points as exact premises coordinates.
- Use one fixed SODA3 endpoint and a single tested HTTP method. Before facility collection, validate GET option behavior with bounded non-facility aggregate queries, including page 1/page 2 over deterministic grouped results. Do not silently switch to POST or legacy endpoints after denial.
- Use a conservative explicit page size, encoded URL ceiling, serial request pacing, total request/decoded-byte budgets, fatal UTF-8/JSON validation and header/body cancellation deadlines. Provider ordering does not replace local duplicate, count and scope checks.
- Reconcile retained rows against paired source counts and distinct license/reporting-file counts. Reject early empty/short pages, repeated pages, extra rows/fields, changed scope, changed metadata and count drift. Test exact-multiple and final-partial pages synthetically. Never treat a short page alone as completeness proof.
- Establish whether `(file_name, license_id)` is a usable release-scoped key through retained aggregate evidence; do not promote the observed single-file/unique-license cohort into an eternal invariant. Preserve nullable values and raw source dates; avoid silently dropping source candidates.
- Retain prerequisite evidence before requests, journal validated selected pages before proceeding, independently replay immutable output, and give routine acquisition to the standalone app only after the collector and lifecycle exist.

Remaining delivery gaps are GET option coverage, actual selected-row serialization, cross-page conservation and absence of a documented snapshot token/truncation contract. Synthetic tests can establish local fail-closed behavior but cannot certify unseen publisher delivery. Metadata-only preflight work can proceed without pretending these later acquisition checks are complete.

## Integrator follow-up: bounded GET pagination check

After the documentation-only review, two serial anonymous GET aggregate requests tested `SELECT provider_program_type,count(*) AS source_rows GROUP BY provider_program_type ORDER BY provider_program_type`, with `pageSize=1`. Page 1 returned HTTP 200 at `2026-09-08T20:09:01.827Z` (83 bytes), containing only Afterschool Child Care Program, count 149. Page 2 returned HTTP 200 at `2026-09-08T20:09:03.362Z` (59 bytes), containing only CBCCPP, count 489. Requests were paced and bounded; no provider records were requested or retained.

This establishes observed GET `pageNumber` and `pageSize` behavior for grouped queries on this endpoint. It does not establish facility delivery, all GET options, future availability, or snapshot consistency.
