# Connecticut childcare source acquisition

This layer prepares bounded, reusable source evidence for Co*Tive's future Connecticut childcare worker. It does not establish verified premises, unique businesses, current operations or national completeness. The separate metadata-only [preflight](CT-CHILDCARE-PREFLIGHT.md) remains unchanged; its receipt is not record-level authorization.

## Source contract and uncertainty

Official [OEC catalog metadata](https://data.ct.gov/api/views/h8mr-dn95.json) identifies dataset `h8mr-dn95`, daily updates, Public Domain licensing and street-address geography. The source investigation on September 8, 2026 confirmed separate `address2/address3` and `mailaddress2/mailaddress3` fields, but their descriptions and the identifier descriptions are empty. The [dataset API documentation](https://dev.socrata.com/foundry/data.ct.gov/h8mr-dn95) supplies field types, not premises verification or key construction.

The acquisition policy applies the user's collection authorization to internal source candidates with `licensetype='Child Care Center' AND status='ACTIVE'`. Other license classes and person/contact/mailing/director/teacher/consultant fields are excluded. Facility names and addresses may incidentally identify individuals; retention is internal, without people enrichment or public export. No fee or agreement is accepted.

`uniquekey` is an opaque, release-scoped source-row key. Do not parse it or assume stability across releases. Preserve repeated `credentialidnt` values and license numbers as source identifiers, not deduplication keys. The observed 1,390 source keys and 1,364 credentials demonstrate why these distinctions matter.

`address2/address3` remain reported lines of unverified role/premises. Separate mailing fields suggest a distinction but do not prove a physical site. Missing-address records remain explicit gaps. No geometry or coordinates are selected or inferred; later normalization must keep latitude/longitude nullable and ZIP5/ZIP4 separate. Unknown premises semantics block verified-site claims, not conservative source retention.

## Bounded collection and durable reuse

The collector uses a baseline source-key roster, 500-row selected pages and a final roster, all with the exact same predicate and explicit `uniquekey ASC` order. Each page must match its baseline slice; paired preflights must agree on sanitized metadata, source update and counts. Page totals reconcile source rows, distinct credentials and nonnull address/ZIP counts. These are observed consistency checks, not an atomic-snapshot guarantee.

Explicit ordering follows the [Socrata paging contract](https://dev.socrata.com/docs/queries/order.html). Source numeric fields remain serialized strings to avoid precision loss, consistent with the [Socrata number datatype](https://dev.socrata.com/docs/datatypes/number.html). Acquisition does not coerce capacities or identifiers into JavaScript numbers.

Credential reconciliation compares exact retained nonnull strings. If the publisher emits numerically equivalent but differently serialized identifiers, such as `1` and `1.0`, the local distinct-string count can disagree with the numeric source aggregate. The attempt then fails with retained evidence for inspection; it does not coerce identifiers, merge rows or automatically repull. Source ordering is checked through explicit query order and matching roster/page slices, not an unsupported local text-collation assumption.

Requests are serial and spaced at least one second apart, with 30-second request and cooperative 15-minute acquisition deadlines. Limits are 20,000 source rows, 80 requests, 8 MB per selected page, 2 MB per other response and 150 MB cumulative decoded bodies. No redirects, credentials, retry or API fallback are allowed. A provider deferral stops the attempt.

The acquired-release writer checks 500 MB free disk, acquires an output-root owner lock, and publishes in immutable UUID job directories. It awaits durable prerequisite retention before membership requests and journals each validated observation before the next request. Complete acquisition is independent of later normalization, so downstream repairs and promotion can reuse retained evidence without repulling.

Offline verification checks the complete artifact roster, hashes, prerequisite/journal linkage, replayed source conservation and immutable publication. Cancellation drains owned writes and cleans only owned incomplete cancellation artifacts. Ordinary failures retain evidence; uncertain publication requires inspection. Partial journals are not automatic restart recovery, and a root lock is not a publisher-global reservation across different roots.

## Entry points and remaining handoff

`buildCtChildcareAcquiredRelease` uses fixed native transport. `buildCtChildcareAcquiredReleaseWithTransport` is an explicitly injected test entry point. `readCtChildcareAcquiredEvidence` performs offline verification only. The CLI accepts an exact absolute manifest path:

```powershell
node scripts/verify-ct-childcare-acquired.mjs --manifest <absolute-manifest-path>
```

The default retention root is `data/business-sources/ct-childcare/acquired`. Recorded execution mode is not independent network attestation. No native facility collection, app operation, recurring schedule or national pointer update is part of this increment. Next: normalize source candidates with explicit gaps and provenance, enroll the complete tested worker with app resource/source reservations, then dispatch with an app operation ID and receipt. Release the agent after accepted dispatch; Co*Tive owns routine downloads.

The subsequent [offline normalization layer](CT-CHILDCARE-NORMALIZATION.md) derives source candidates from verified retained acquisitions, preserving missing-field gaps and separate ZIP5/ZIP4. It does not itself dispatch collection or enroll a worker.

Rollback disables use of this new acquisition layer. Preserve all retained evidence and existing source/national releases; no source-current pointer is replaced here.

## Verification — September 8, 2026

Seven grouped acquisition/writer tests passed using synthetic fixtures only, including a 501-row two-page cohort, repeated credentials, missing address, privacy exclusions, membership/count/schema drift, provider failures, cancellation and drained retention hooks, root exclusion, immutable publication, offline CLI replay and rehashed execution-mode/journal substitution rejection. No external fixture or source download was required.

The full `npm run check` passed with 1,242 tests: 1,231 passed, 11 explicitly skipped and none failed. Lint, web/desktop builds and desktop control-plane smoke passed. Type checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins were unchanged. Evidence log: `data/tmp/ct-childcare-acquisition-full-check.log`. The app was restored and returned HTTP 200. These checks establish tested collector behavior, not a native facility collection or complete industry coverage.
