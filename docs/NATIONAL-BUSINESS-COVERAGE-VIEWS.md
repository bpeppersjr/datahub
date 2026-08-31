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
- national business entity resolution;
- the independent entity-resolution benchmark packet; and
- the Census Nonemployer Statistics annual aggregate baseline.

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

All 56 state equivalents appear, including zero-evidence rows. Counts distinguish profiles assigned by their source-reported address state from profiles whose coordinates fall within a county in that state. Conflicts remain counted and neither value overwrites the other. The 51 states/D.C. in the Census Nonemployer source receive their published annual no-paid-employee baseline; the five territory rows remain visible with an explicit out-of-source-scope status.

### County

All 3,235 county equivalents appear. A county profile count includes only a source-preserving registry location profile with one valid point falling in that generalized Census county polygon. Profiles without points, points outside every county polygon, and boundary points matching multiple counties remain unallocated and visible as gaps. Census publishes 2023 Nonemployer totals for 3,143 county rows; the other 92 county equivalents remain explicit null-baseline gaps.

ZIP totals are never distributed to counties with ZCTA polygon-area weights. `zip_business_count_allocation` is therefore always `null`.

### ZIP

Every row from the registry's 48,118-ZIP union is retained with source counts, source temporal metadata, ZBP employer baseline, USPS-validity status, ZCTA status, and complete many-to-many jurisdiction topology when a ZCTA exists. A ZCTA relationship continues to mean polygon area only—not the distribution of people, addresses, establishments, or businesses.

Every ZIP row carries `complete_all_businesses: false` and `entity_resolution_applied: false`.

Census Nonemployer Statistics has no ZIP-level geography. Every ZIP view therefore carries `nonemployer_baseline_allocation: null` and a declared no-allocation gap; national, state, or county Nonemployer totals are never area-weighted or otherwise distributed to ZIPs/ZCTAs.

### Source and gaps

Record-level source rows reconcile ZIP contribution counts with profile geography coverage, observation ranges, missing coordinates, unmatched points, ambiguous boundaries, and state conflicts. Connecticut reports 458,536 active-registration organizations and 447,807 eligible reported addresses; Colorado reports 2,169,062 Good Standing/Delinquent organizations, one quarantined source row, and 2,154,593 eligible principal-office addresses. Oregon reports 559,490 active registrations—443,158 legal entities and 116,332 assumed names—with 559,141 registration/ZIP contributions across 9,177 source ZIPs. Iowa reports 347,200 active-registration organizations, zero quarantined entities, 334,176 eligible home-office/ZIP contributions, and 330,664 source-geocoded organizations across 9,901 source ZIPs. New York reports 4,275,497 active-extract organizations, zero quarantined rows, and 352,234 eligible reported-location/ZIP contributions across 8,653 source ZIPs. Florida reports 12,808,196 total quarterly corporate rows, including 4,109,232 coded active and 8,698,964 excluded inactive; it publishes 4,109,230 active organizations after quarantining two malformed active rows and contributes 3,928,280 eligible principal-address ZIP records across 19,064 source ZIPs. Pennsylvania reports 2,347,230 active-registration source rows, publishes 2,347,229 organizations after collapsing one duplicate filing-number row, and contributes 2,088,998 eligible reported-business-address records across 4,537 source ZIPs. All seven state-registry sources intentionally have zero location profiles. The separate Census Nonemployer source row reports only its annual aggregate national/state/county coverage and explicitly records that ZIP allocation is unavailable.

Gap rows are first-class data. They include global blockers, inherited registry limitations, per-source coordinate gaps, ZIPs without record-level contributions, ZIPs without ZCTAs or employer baselines, ZCTA overlay diagnostics, and county equivalents without ZCTA intersections.

## Management page and read-only API

The Co*Tive Collector management page exposes the current verified release in the **U.S. business coverage** panel. Operators can search and page through states, counties, ZIPs, source summaries, and coverage gaps without loading the large ZIP artifact into the browser. County filters accept a two-digit state FIPS code; ZIP search is a numeric prefix; gap rows can be narrowed to one declared gap type. State, county, and source views show the Nonemployer baseline separately from source-preserving profiles.

The runner serves the same local-only, read-only view at:

- `GET /api/business-coverage` for release metadata, national totals, and source summaries;
- `GET /api/business-coverage/states?query=&offset=&limit=`;
- `GET /api/business-coverage/counties?query=&state_fips=&offset=&limit=`;
- `GET /api/business-coverage/zips?query=&offset=&limit=`;
- `GET /api/business-coverage/sources?query=&offset=&limit=`; and
- `GET /api/business-coverage/gaps?query=&gap_type=&offset=&limit=`.

Page size is capped at 100. The store validates the current pointer and release path before reading artifacts, caches immutable state/county/source/gap rows by release ID, and builds a compact ZIP index by streaming the ZIP artifact. Responses preserve the release's source-specific semantics and do not apply entity-resolution aliases.

## Identity and export boundary

Registry physical sites and establishments remain provisional and source-preserving. The current entity-resolution release has reversible aliases, but its independent benchmark has no submitted labels and its precision/export gate has not passed. These views therefore do not apply aliases or claim deduplicated business counts.

The release export policy is `local-aggregate-review-required`. It includes aggregate counts and geography identifiers, not names, street addresses, personal contacts, or raw profile records.

The machine-readable contracts are [`config/datasets/national-business-coverage-views.json`](../config/datasets/national-business-coverage-views.json), [`config/connectors/national-business-coverage-views.json`](../config/connectors/national-business-coverage-views.json), and [`config/source-policies/national-business-coverage-views.json`](../config/source-policies/national-business-coverage-views.json).

## Current verified release

Release `national-business-coverage-views-20260831-192859465Z-901d9348` publishes seven independently verified artifacts totaling 386,136,878 bytes. It contains three national scopes, all 56 state equivalents, all 3,235 county equivalents, all 48,118 registry ZIP rows, 16 source views, and 27,889 explicit gap rows.

The publisher assessed all 6,161,280 source-preserving location profiles. Source-reported address states match a supported Census state equivalent for 6,161,013 profiles; 267 remain missing or unsupported. Exactly 336,600 profiles carry valid points, 336,573 have one county assignment, 20 fall outside every generalized county polygon, and seven sit on ambiguous county boundaries. Eleven profiles have a conflict between their reported state and coordinate-derived county state; both observations remain visible.

County point coverage currently comes from SNAP, FDIC, and FSIS profile layers. The current registry match-profile layer carries no point for NPPES, ECHO, FMCSA, or NCUA, so their 5,824,678 point-missing profiles are not silently placed in counties. ECHO retains source-reported coordinates and precision metadata in its own governed assertion layer, but those assertions are not generalized into premise-level match-profile points.

Of the 48,118 ZIP rows, 47,903 have record-level source contributions and 215 are denominator-only. The ZIP/ZCTA join reconciles exactly to all 33,791 crosswalk ZCTAs, leaving 14,327 ZIP rows without a ZCTA polygon. Census ZBP publishes an employer baseline for 34,954 ZIP rows; 13,164 retain an explicit unpublished or missing-baseline gap. Pennsylvania expands the source-reported ZIP union, but those values retain explicit ZCTA/ZBP gaps and unverified USPS status rather than being promoted to current valid postal assignments. The authoritative current USPS ZIP denominator remains unavailable, so no percentage over “all valid ZIP Codes” is published.

The release also pins the verified 2023 Census Nonemployer baseline. It exposes 30,427,808 annual no-paid-employee establishments at the national/51-state-and-D.C. scope and 30,427,807 across 3,143 published county totals. One establishment remains unallocated to county, five state equivalents and 92 county equivalents remain outside the source geography scope, and no Nonemployer value is assigned to a ZIP.

The release remains local aggregate, partial, and non-deduplicated. Connecticut, Colorado, Iowa, New York, Florida, and Pennsylvania organization addresses plus Oregon organization/brand addresses stay out of physical-site state/county counts and remain explicit in the entity-only allocation gap. These sources contribute no location profiles, so the physical-location profile total and every point-derived county count remain unchanged. The identity gate records zero benchmark labels, entity resolution unapplied, and export authorization false.
