# Delaware current business licenses

This source adapter ingests the official Delaware Department of Finance, Division of Revenue `Delaware Business Licenses` dataset (`5zy2-grhr`). The catalog describes the feed as businesses currently licensed in Delaware, marks it Public Domain, and reports daily publication.

The adapter selects thirteen business-license and address fields plus the Socrata row identifier. It does not query owner, officer, principal, registered-agent, phone, email, or contact data. An immutable, checksummed selected-field snapshot is retained internally.

Repeated source rows with the same ten-digit license number are grouped. A consistent group becomes one provisional organization candidate, with distinct trade names and business activities preserved. A group with conflicting business names, address blocks, or license-validity periods is quarantined; accepted and quarantined rows must reconcile to the source snapshot and the quarantine rate may not exceed five percent.

## Address and identity limits

A Division of Revenue business address is not asserted as a physical operating site. It may be administrative, virtual, residential, stale, or outside Delaware. Consequently this layer creates no site or establishment entities. Valid U.S. ZIP5 and ZIP+4 values support aggregate ZIP coverage, but current USPS validity remains unverified until an authorized operational denominator is available.

Catalog geocodes are retained only as source-reported mapping aids. Coordinates for a reported Delaware address that fall outside broad Delaware bounds are flagged; no coordinate is independently validated.

Business names can identify sole proprietors and business addresses can be residences. Source and normalized record-level artifacts are therefore local-review-only. ZIP and source aggregates can be published with attribution, provenance, and the license and address limitations intact.

## Commands

```powershell
npm run de-business:build
npm run de-business:verify
```

The build pins catalog identity, attribution, Public Domain status, the current-license description, and a selected-schema fingerprint. It rechecks the catalog refresh and row counts before publishing `current.json`. The verifier independently checks every artifact checksum, selected source field, source-release identity, privacy classification, partition, quarantine record, normalized organization, and ZIP aggregate.

## Bounded transport prerequisite (September 8, 2026)

The HTTP helper now applies a 60-second per-attempt deadline through header and body delivery, an 80 MB declared/decoded streaming body ceiling, fatal UTF-8 decoding, and cancellation of unread error/retry bodies. Trusted programmatic options can lower the byte ceiling and select a deadline from 1–300,000 ms; they cannot raise the byte ceiling. No new CLI overrides are exposed. At most five attempts run serially. Retry-After seconds or dates are never shortened; waits exceeding one day defer with an error. Caller cancellation interrupts reads and retry waits. Transport and JSON errors omit response contents.

These are per-response limits, not a whole-acquisition byte or elapsed-time budget. This repair does not enroll Delaware into managed industry jobs, wire CLI cancellation, alter publication or staging retention, refresh publisher-policy evidence, or download data. Existing source policy, connector contract and retained releases remain unchanged. CLI/publication cancellation and lifecycle review remain prerequisites before managed app handoff.

Validation: 15 focused Delaware tests passed, including late response cleanup, stalled streams, chunked and declared byte ceilings, invalid limits before requests, native and injected retry-wait cancellation, and monotonic deadline rejection after synchronous work. The combined repository check passed with 1,100 tests passed, 11 skipped and zero failures; builds, type checking, desktop smoke and the zero-vulnerability dependency audit passed. All 82 pending production pins remained unchanged. Rollback reverts the transport/helper tests without touching retained data or the pinned connector contract; do not treat rollback as permission to enroll an unbounded connector.
