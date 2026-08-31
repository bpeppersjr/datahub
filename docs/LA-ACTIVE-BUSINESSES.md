# City of Los Angeles active business location accounts

The Los Angeles connector publishes a governed location-account layer from the official Office of Finance [Listing of Active Businesses](https://data.lacity.org/Administration-Finance/Listing-of-Active-Businesses/6rrh-rzua) dataset (`6rrh-rzua`). The catalog identifies the source as CC0 1.0, monthly, public, and anonymously queryable through HTTPS.

## What “active” means

The publisher defines an active business as a registered business whose owner has not notified the Office of Finance of a cessation of business operations. The connector preserves that exact source meaning. It does not turn it into proof that the business is continuously operating, solvent, open to the public, maintaining current hours, or licensed for every activity.

Each accepted Office of Finance location account creates one provisional physical-site candidate and one provisional establishment candidate joined by `located_at`. The source explicitly describes the street, city, and ZIP as the business-location address, but neither the address nor the portal coordinate is independently verified. No owner, legal organization, parent company, or cross-source identity is inferred.

Council district `0` means the source places the location outside the City of Los Angeles. A nonzero district is retained as the portal’s current assignment, not as permanent historical geography. Source coordinates attached to nonzero districts but outside a deliberately broad Los Angeles bounding box remain visible with a plausibility warning rather than being silently corrected.

## Privacy and selected fields

The source can include sole-proprietor names and residential business locations. Record-level source and normalized data therefore remain inside `datahub`; normalized records and their downstream assertions and match profiles are `local-review-only`. Aggregate ZIP and source counts may be shared with provenance and source limitations.

The connector acquires only:

- location account, legal business name, and pipe-separated DBA names;
- business-location street, city, and ZIP/ZIP+4;
- self-reported NAICS code and description;
- council district, location start/end date, and optional source coordinate.

Mailing address/city/ZIP, the redundant location description, and every portal-computed region field are excluded at query time. A Census ZBP postal label can supply an explicit derived-state value when available; the record marks that state as derived because the Los Angeles source does not publish a state column.

## Build and verify

```powershell
npm run la-active-businesses:build
npm run la-active-businesses:verify
```

The publisher pins the 12 selected field names and types, rejects redirects and source drift, pages in deterministic location-account/source-row order, limits every response, retries only transient failures, and checks the catalog timestamp and row count again before publication. Invalid U.S. ZIP syntax and incomplete business-location addresses go to an internal quarantine. Duplicate location-account identities, unexpected end dates, malformed core identities, invalid council districts, bad coordinates, schema drift, or an excessive quarantine rate fail the run.

All selected source rows, normalized partitions, quarantine records, ZIP aggregates, catalog metadata, and summaries are checksummed in an immutable release. `current.json` changes only after the staging release passes the independent verifier.

## Current verified release

Release `la-active-businesses-20260831-195158034Z-5a5328d2` pins source refresh `2026-08-15T15:37:22Z`. It retains 633,782 selected source location accounts and publishes 633,332 normalized U.S. location/establishment candidates. The remaining 450 rows are quarantined—a rate of 0.0710%—including 365 invalid/non-U.S.-format ZIP values and 85 incomplete business-location addresses.

The release includes 566,943 source-geocoded locations, 482,261 accepted locations with a nonzero council district, 151,071 source-designated out-of-city locations, 29,457 nonzero-district coordinates outside the broad plausibility bounds, and contributions across 5,437 source ZIP values. Its 21 verified artifacts total 227,107,980 bytes. These counts describe the source snapshot, not a complete population of Los Angeles or U.S. businesses.

## Official references

- [Los Angeles Open Data dataset](https://data.lacity.org/Administration-Finance/Listing-of-Active-Businesses/6rrh-rzua)
- [Official Socrata metadata](https://data.lacity.org/api/views/6rrh-rzua)
- [CC0 1.0 legal code](https://creativecommons.org/publicdomain/zero/1.0/legalcode)
