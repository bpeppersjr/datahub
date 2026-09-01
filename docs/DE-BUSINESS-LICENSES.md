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
