# Governed national business coverage views

`national-business-coverage-views` is the operator-facing aggregate layer over the current governed business registry. It publishes one immutable release containing national, state, county, ZIP, source, and explicit coverage-gap views.

It is intentionally a **coverage view**, not a claim that every active U.S. business has been collected. Source-specific active, current, authorized, registered, regulated, or filing evidence remains source-specific. Missing evidence never becomes a closure or absence assertion.

## Build and verify

The publisher is local-only and makes no network requests:

```powershell
npm run coverage-views:build
npm run coverage-views:verify
```

It consumes the current immutable releases for:

- the national business registry;
- Census state, county, and ZCTA geography;
- the Census ZCTA-to-jurisdiction polygon overlay;
- national business entity resolution; and
- the independent entity-resolution benchmark packet.

Every dependency release ID and manifest SHA-256 digest is pinned in the output manifest. Generated releases remain under `data/business-coverage-views` and are ignored by Git; the tracked dataset catalog records the verified live release identity and metrics.

## View contract

```text
data/business-coverage-views/
|-- current.json
`-- releases/<release-id>/
    |-- manifest.json
    |-- derived/profile-geography-summary.json
    `-- views/
        |-- national.jsonl
        |-- states.jsonl
        |-- counties.jsonl
        |-- zips.jsonl
        |-- sources.jsonl
        `-- coverage-gaps.jsonl
```

### National

Three rows keep distinct denominators:

- the complete selected registry union, including supported U.S. territories and rows without ZCTA polygons;
- all 56 Census state-equivalent areas; and
- the 50 states plus District of Columbia.

The registry-union row preserves the registry manifest totals. Census-scope rows aggregate reported-address state evidence and the coordinate-assigned county subset without pretending unlocated profiles have county assignments.

### State

All 56 state equivalents appear, including zero-evidence rows. Counts distinguish profiles assigned by their source-reported address state from profiles whose coordinates fall within a county in that state. Conflicts remain counted and neither value overwrites the other.

### County

All 3,235 county equivalents appear. A county profile count includes only a source-preserving registry location profile with one valid point falling in that generalized Census county polygon. Profiles without points, points outside every county polygon, and boundary points matching multiple counties remain unallocated and visible as gaps.

ZIP totals are never distributed to counties with ZCTA polygon-area weights. `zip_business_count_allocation` is therefore always `null`.

### ZIP

Every row from the registry's 43,586-ZIP union is retained with source counts, source temporal metadata, ZBP employer baseline, USPS-validity status, ZCTA status, and complete many-to-many jurisdiction topology when a ZCTA exists. A ZCTA relationship continues to mean polygon area only—not the distribution of people, addresses, establishments, or businesses.

Every ZIP row carries `complete_all_businesses: false` and `entity_resolution_applied: false`.

### Source and gaps

Source rows reconcile ZIP-level contribution counts with profile geography coverage, observation ranges, missing coordinates, unmatched points, ambiguous boundaries, and state conflicts.

Gap rows are first-class data. They include global blockers, inherited registry limitations, per-source coordinate gaps, ZIPs without record-level contributions, ZIPs without ZCTAs or employer baselines, ZCTA overlay diagnostics, and county equivalents without ZCTA intersections.

## Identity and export boundary

Registry physical sites and establishments remain provisional and source-preserving. The current entity-resolution release has reversible aliases, but its independent benchmark has no submitted labels and its precision/export gate has not passed. These views therefore do not apply aliases or claim deduplicated business counts.

The release export policy is `local-aggregate-review-required`. It includes aggregate counts and geography identifiers, not names, street addresses, personal contacts, or raw profile records.

The machine-readable contracts are [`config/datasets/national-business-coverage-views.json`](../config/datasets/national-business-coverage-views.json), [`config/connectors/national-business-coverage-views.json`](../config/connectors/national-business-coverage-views.json), and [`config/source-policies/national-business-coverage-views.json`](../config/source-policies/national-business-coverage-views.json).

## Current verified release

Release `national-business-coverage-views-20260830-224156693Z-66a2f2ff` publishes seven independently checksummed artifacts totaling 231,412,674 bytes. It contains three national scopes, all 56 state equivalents, all 3,235 county equivalents, all 43,586 registry ZIP rows, eight source views, and 18,753 explicit gap rows.

The publisher assessed all 6,161,280 source-preserving location profiles. Source-reported address states match a supported Census state equivalent for 6,161,013 profiles; 267 remain missing or unsupported. Exactly 336,600 profiles carry valid points, 336,573 have one county assignment, 20 fall outside every generalized county polygon, and seven sit on ambiguous county boundaries. Eleven profiles have a conflict between their reported state and coordinate-derived county state; both observations remain visible.

County point coverage currently comes from SNAP, FDIC, and FSIS profile layers. The current registry match-profile layer carries no point for NPPES, ECHO, FMCSA, or NCUA, so their 5,824,678 point-missing profiles are not silently placed in counties. ECHO retains source-reported coordinates and precision metadata in its own governed assertion layer, but those assertions are not generalized into premise-level match-profile points.

Of the ZIP rows, 43,310 have record-level source contributions and 276 are denominator-only. The ZIP/ZCTA join reconciles exactly to all 33,791 crosswalk ZCTAs, leaving 9,795 ZIP rows without a ZCTA polygon. Census ZBP publishes an employer baseline for 34,954 ZIP rows; 8,632 retain an explicit unpublished or missing-baseline gap. The authoritative current USPS ZIP denominator remains unavailable, so no percentage over “all valid ZIP Codes” is published.

The release remains local aggregate, partial, and non-deduplicated. Its identity gate records zero benchmark labels, entity resolution unapplied, and export authorization false.
