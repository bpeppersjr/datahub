# Pennsylvania childcare acquisition

This layer acquires and preserves the selected source cohort for later normalization. It is not a national registry release, independently verified active-business count, or managed refresh schedule.

## Source-use boundary

The [official portal policy](https://data.pa.gov/data-policy) offers its datasets free and without restriction, while retaining applicability-of-law and disclaimer provisions. The versioned `pa-childcare-centers-internal` profile applies the user's existing US business-collection instruction to a bounded, internal-only selection from DHS dataset `ajn5-kaxt`. It does not accept an agreement, incur a fee, grant legal approval or authorize public export.

The exact selection is `provider_type='Child Care Center'`. It excludes home-provider categories and all person, phone, email, fax, responsible-person and legal-entity fields. Facility names and addresses may still incidentally identify individuals, so source records remain internal. Raw catalog responses are sanitized by the separate [preflight](PA-CHILDCARE-PREFLIGHT.md); cached samples are not retained.

## Collection contract

The collector uses an explicitly ordered baseline list of location IDs, 500-row pages with the same order and center predicate, and a matching final ID list. Each selected page must equal the corresponding baseline slice by location ID. The [Socrata ordering contract](https://dev.socrata.com/docs/queries/order.html) requires an explicit ordering for paging. Offset paging here avoids assuming that local JavaScript collation matches the publisher's text collation.

Both ends of acquisition include full metadata/count/policy preflights. Selected schema, source update timestamp, aggregate counts and membership must agree. These checks detect observed drift but do not create a transactional snapshot or independently prove unchanged record contents between requests.

Requests are serial, paced at least one second apart, bounded by per-response and cumulative byte limits, finite request counts and cooperative deadlines. Redirects, arbitrary URLs, API fallback and automatic retries are excluded. A provider deferral stops the attempt. More available RAM does not increase the provider budget.

Source fields are preserved without guessing. Nullable fields may be omitted by Socrata; an absent point does not remove a facility from the cohort. The address point uses [longitude-first WGS84 coordinates](https://dev.socrata.com/docs/datatypes/point.html), not a business polygon. Later normalization must emit separate ZIP5 and ZIP4 and nullable latitude/longitude. It must not invent a ZIP extension, treat a calendar date as a UTC observation, or interpret source capacity text as a number without validation.

## Durable acquisition and reuse

The writer retains the completed prerequisite before the first membership request. Each validated data observation is durably journaled before the next request. A completed acquisition is saved separately from any later normalization, so parsing or quality repairs can reuse it without repulling.

Jobs use immutable UUID directories beneath `data/business-sources/pa-childcare-centers/acquired/jobs`. Manifests publish last. Verification checks artifact hashes, an exact file roster, prerequisite and journal linkage, chronology, and replayed source conservation. An output-root owner lock prevents overlapping writers to that root and is never reclaimed solely by age or PID. Separate roots are not a publisher-global reservation; managed enrollment must use the existing shared source reservation system.

Ordinary failures retain evidence for inspection. Cancellation cleans only owned incomplete artifacts before publication. Uncertain publication must be inspected rather than automatically retried. Partial journals are not an automatic resume guarantee. Successful immutable evidence can be verified offline; verification makes no source requests.

## Remaining application handoff

The module APIs are `buildPaChildcareAcquiredRelease` (fixed native transport), `buildPaChildcareAcquiredReleaseWithTransport` (explicit synthetic/injected transport), and `readPaChildcareAcquiredEvidence` (offline only). The verifier command is `node scripts/verify-pa-childcare-acquired.mjs --manifest <absolute-manifest-path>`. It rejects ambiguous arguments and returns bounded verification metadata, not facility names or addresses.

Native acquisition and injected-test transport are separate entry points. A recorded native mode is not independent network attestation. No managed operation, recurring schedule or national promotion is implied by the existence of this layer.

Next: normalize and verify the retained facility cohort, preserving missing geographic fields and source provenance; enroll the tested end-to-end worker in Co*Tive's managed industry operations; dispatch with an actual operation ID and persisted receipt. After that accepted handoff, routine collection and refresh belong to the app, not a live Codex agent.

Rollback: leave retained acquisitions intact and disable any future enrollment separately. This layer does not replace a source-current or national-production pointer.

## Implementation verification — September 8, 2026

Seven grouped acquisition/writer tests passed, using synthetic records only. They include a 501-record two-page cohort, missing point/license conservation, unexpected fields, provider errors, malformed responses, metadata and membership drift, rehashed evidence substitution, oversized retained payloads, persistence barriers, cancellation draining, root-level exclusion and offline CLI verification. No live facility requests or managed jobs were dispatched in this increment. The previous real metadata/count receipt remains separate evidence.

The npm test command now caps concurrent test files at four. This follows two observed development-supervisor startup failures with 28-way default test execution and a passing bounded full-suite rerun. Test assertions, service startup deadlines, app worker limits and provider budgets are unchanged. This avoids repeatedly launching a known over-parallel test workload during source development.

The full `npm run check` passed: 1,206 tests, 1,195 passed, 11 explicitly skipped, none failed; lint, web/desktop builds and desktop smoke also passed. TypeScript passed and the production dependency audit reported zero vulnerabilities. Evidence log: `data/tmp/pa-childcare-acquisition-full-check.log`. The pending national rebuild's 82 code/configuration pins remained unchanged. These checks prove the implemented acquisition/replay behavior against fixtures, not a live PA facility collection or complete industry coverage.
