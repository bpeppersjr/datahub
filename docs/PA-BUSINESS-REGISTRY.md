# Pennsylvania Department of State active business registrations

The Pennsylvania connector publishes a governed organization layer from the official Department of State dataset **Filtered View - Distinct Registered Businesses in PA Listing Current by County Department of State** (`3urc-uaba`). Pennsylvania's open-data policy says portal datasets are offered free and without restriction. The connector uses anonymous HTTPS and does not require an API key.

This layer is registration evidence, not a physical-business census. The publisher explicitly warns that statutory limitations on removing businesses no longer in operation cause the active-registration dataset to be larger than the currently operating business population. Every normalized status assertion retains that warning.

## Privacy and field selection

The connector requests only these public business-level fields:

- business name and Department of State filing number;
- reported business address, including the source ZIP or ZIP+4;
- registration type;
- source county name and alphabetical 01-through-67 county code; and
- the portal-generated geocode, when present.

The underlying repeated-row dataset contains governor/principal-officer roles and officer first, middle, and last names. Those fields are excluded at query time and never enter the selected-field source snapshot. The source county code is not a county FIPS code and is labeled accordingly.

## Address and coordinate semantics

A reported business address may be administrative, residential, virtual, mailing-like, stale, or otherwise unrelated to a customer-facing location. It creates a reported-address assertion only; it never creates a physical site or establishment.

Exact five-digit ZIPs and ZIP+4 values are normalized. A malformed one-to-three-digit extension such as `17856-0` is excluded while the leading ZIP5 is retained with an explicit quality status. USPS operational validity remains unverified until an authorized current operational ZIP denominator is integrated.

Portal-generated coordinates are preserved as source assertions, not independently verified coordinates. A coordinate for a reported Pennsylvania address that falls outside a deliberately broad Pennsylvania bounding box is retained and flagged, so source defects remain visible.

## Duplicate handling

The source's so-called distinct view currently has one filing number represented by two rows because a portal geocode is present on one row and absent on the other. Filing number is the organization identity. Duplicate filing-number groups are collapsed deterministically by preferring a row with a source geocode and then the more complete row. Source rows, distinct filing numbers, duplicate groups, and collapsed rows must all reconcile in the manifest and external verifier.

## Build and verify

```powershell
npm run pa-business:build
npm run pa-business:verify
```

The build:

1. pins publisher, license label, selected schema, refresh timestamp, total source rows, and distinct filing count;
2. acquires one selected-field page at a time in filing-number and Socrata-row order;
3. hashes the immutable internal source snapshot;
4. rechecks metadata and counts to reject a source change during acquisition;
5. normalizes and partitions public organization records;
6. produces ZIP coverage and source-quality summaries;
7. independently verifies every artifact, source record, normalized identity, privacy exclusion, count reconciliation, partition, and ZIP total; and
8. atomically publishes the release and updates `current.json` only after verification.

A complete unpublished staging run can be reverified and published without another download:

```powershell
node scripts/build-pa-business-registry.mjs --resume-staging-run <UUID>
```

## Validated live release

The independently verified release `pa-business-registry-20260831-153419013Z-b52dec9e` pins the source refresh at `2026-08-04T14:12:34Z`. It preserves 2,347,230 selected-field source rows, publishes 2,347,229 distinct organizations after deterministically collapsing one duplicated filing-number row, and records 2,088,998 eligible reported U.S. business addresses. Of 2,227,747 source-geocoded addresses, 2,320 reported as Pennsylvania addresses fall outside the deliberately broad state bounds and remain flagged. The 20 verified artifacts total 431,363,581 bytes. No physical site or establishment is inferred.

## Official references

- Dataset story: <https://data.pa.gov/stories/s/Story-Registered-Businesses-in-PA-Current-by-Count/y547-53sn/>
- Distinct-business dataset: <https://data.pa.gov/d/3urc-uaba>
- Pennsylvania open-data policy: <https://data.pa.gov/data-policy>
