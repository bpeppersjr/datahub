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

Filing number is the organization identity. If the source's so-called distinct view contains more than one row for a filing number, duplicate filing-number groups are collapsed deterministically by preferring a row with a source geocode and then the more complete row. Source rows, distinct filing numbers, duplicate groups, and collapsed rows must all reconcile in the manifest and external verifier. The current retained release contains no duplicate filing-number groups, while the preceding retained release contained one group and one collapsed row.

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

## Recurring source review

The official Pennsylvania catalog, data policy, registry-status guidance, and anonymous API transport were reviewed again on 2026-11-12. The portal continues to offer its datasets free and without restriction, labels this dataset `Public Domain U.S. Government`, asks for attribution, disclaims quality and fitness warranties, disclaims endorsement of secondary analysis, and may discontinue content. Co*Tive displays those limitations and keeps the stronger source-specific warning that registry inclusion substantially overstates operating businesses.

A zero-record transport preflight returned HTTP 200 for official metadata and HTTP 200 for an aggregate total/distinct-filing query. Metadata reported dataset `3urc-uaba`, the expected title, Department of State attribution, `rowsUpdatedAt=1793725840`, and the expected license; its 25,651 bytes hashed to `f152a7ee0c26c7513f9b21b7eaa47b6632e7c222c675ba39c177152473d8e56c`. The aggregate response contained only `records=2386129` and `distinct_filings=2386129`; its 53 bytes hashed to `fb6ef8abf9f12d61ade7b0b9e9dd954295f0939e881fb7186b8e1991c8f68582`. No organization rows were requested or retained by this review.

The live aggregate exceeds the retained 2,360,829-row release by 25,300 rows. That difference establishes refresh value only; it is not net business creation, current operation, a closure count, or completeness.

Authorization `pa-business-registry-production-20261112-01` permits Co*Tive—not Codex—to run the full snapshot, independently verify its immutable release, and change only this source's pointer after verification. It binds the exact builder, verifier, connector, policy, and dataset bytes; any change invalidates dispatch. It does not authorize officer or agent fields, infer premises, or upgrade Pennsylvania's overinclusive registration cohort into an active-business denominator.

## Validated live release

The independently verified release `pa-business-registry-20260903-011928723Z-b4cbfaf4` is bound to source release `pa-business-registry-2026-09-02-5aea113d98c4bfb7` and pins the source refresh at `2026-09-02T13:36:39.000Z`. It preserves and publishes 2,360,829 selected-field source rows as distinct organizations, with no duplicate filing-number groups or collapsed rows, and records 2,102,830 eligible reported U.S. business addresses. Of 2,241,410 source-geocoded addresses, 2,319 reported as Pennsylvania addresses fall outside the deliberately broad state bounds and remain flagged. The 20 verified artifacts total 433,431,904 bytes. No physical site or establishment is inferred. ZIP5 remains separate from ZIP+4, current USPS validity remains unverified, and portal coordinates remain source assertions rather than independently validated premise geocodes.

## Official references

- Dataset story: <https://data.pa.gov/stories/s/Story-Registered-Businesses-in-PA-Current-by-Count/y547-53sn/>
- Distinct-business dataset: <https://data.pa.gov/d/3urc-uaba>
- Pennsylvania open-data policy: <https://data.pa.gov/data-policy>
