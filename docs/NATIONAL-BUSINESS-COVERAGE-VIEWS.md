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

Every row from the registry's 48,217-row five-digit postal-value union is retained with source counts, source temporal metadata, ZBP employer baseline, optional USPS routing evidence, ZCTA status, and complete many-to-many jurisdiction topology when a ZCTA exists. A ZCTA relationship continues to mean polygon area only—not the distribution of people, addresses, establishments, or businesses.

Every ZIP row carries `complete_all_businesses: false` and `entity_resolution_applied: false`.

Census Nonemployer Statistics has no ZIP-level geography. Every ZIP view therefore carries `nonemployer_baseline_allocation: null` and a declared no-allocation gap; national, state, or county Nonemployer totals are never area-weighted or otherwise distributed to ZIPs/ZCTAs.

### Source and gaps

Record-level source rows reconcile ZIP contribution counts with profile geography coverage, observation ranges, missing coordinates, unmatched points, ambiguous boundaries, and state conflicts. Connecticut reports 458,536 active-registration organizations and 447,807 eligible reported addresses. Delaware reports 67,605 current-license rows; 67,556 accepted rows produce 66,379 organizations after 49 rows in 27 conflicting license groups are quarantined, and 66,215 organizations contribute eligible reported U.S. business-address evidence. Alaska reports 94,820 source-defined active-license rows; it publishes 94,818 organizations, 94,486 conditional provisional physical sites, 94,504 reported U.S. address/ZIP contributions, and 121,300 accepted license-to-NAICS pairs after quarantining two expired rows. Colorado reports 2,169,062 Good Standing/Delinquent organizations, one quarantined source row, and 2,154,593 eligible principal-office addresses. Washington L&I reports 75,796 A/ACTIVE contractor-license rows grouped into 72,783 UBI organizations, including 2,590 multi-license organizations, 73,722 reported business-name observations, 74,116 reported mailing-address observations, and 74,005 ZIP-eligible mailing addresses; 105 organizations have no eligible U.S. ZIP address. Oregon reports 559,490 active registrations—443,158 legal entities and 116,332 assumed names—with 559,141 registration/ZIP contributions across 9,177 source ZIPs. Iowa reports 347,200 active-registration organizations, zero quarantined entities, 334,176 eligible home-office/ZIP contributions, and 330,664 source-geocoded organizations across 9,901 source ZIPs. New York reports 4,275,497 active-extract organizations, zero quarantined rows, and 352,234 eligible reported-location/ZIP contributions across 8,653 source ZIPs. Florida reports 12,808,196 total quarterly corporate rows, including 4,109,232 coded active and 8,698,964 excluded inactive; it publishes 4,109,230 active organizations after quarantining two malformed active rows and contributes 3,928,280 eligible principal-address ZIP records across 19,064 source ZIPs. Pennsylvania reports 2,347,230 active-registration source rows, publishes 2,347,229 organizations after collapsing one duplicate filing-number row, and contributes 2,088,998 eligible reported-business-address records across 4,537 source ZIPs. All nine organization/brand-only state sources intentionally have zero location profiles. The separate Census Nonemployer source row reports only its annual aggregate national/state/county coverage and explicitly records that ZIP allocation is unavailable.

The Los Angeles Office of Finance source differs from the organization-only state registries because it explicitly publishes location accounts and business-location addresses. Of 633,782 source rows, 633,332 accepted rows contribute provisional site/establishment profiles and ZIP counts, 566,943 include source coordinates, and 450 remain quarantined. The source’s “active” definition remains distinct, and record-level location/profile data stays local-review-only because names and addresses can identify people or homes. Aggregate views retain the 482,261 nonzero-council-district locations, 151,071 source-designated out-of-city locations, and 29,457 suspect nonzero-district coordinates.

Alaska likewise contributes conditional site/establishment profiles, but the official files contain no premise coordinates. Its 94,486 profiles therefore retain reported-state and ZIP evidence without being silently assigned to counties. Owner, mailing, and contact fields are excluded, record-level artifacts remain local-review-only, and even aggregate distribution remains subject to a separate Alaska terms review.

The Texas Comptroller layer contributes 885,097 source-defined active permit outlets and 700,705 taxpayer organizations from 885,278 source rows. Its 181 quarantines remain explicit. All accepted outlets contribute ZIP and location-profile evidence, but no premise coordinates are present, so they add no coordinate-derived county assignments. Active remains permit status only, and record-level entities and profiles stay local-review-only.

The City of Chicago BACP layer contributes 42,864 grouped license sites and 35,694 account organizations from 53,863 current-active license rows. It accepts 52,885 license rows and quarantines 978 rows across 956 site groups, including publisher-redacted addresses that are never reconstructed. Multiple active licenses remain assertions on one account/site instead of becoming extra sites. Of the accepted sites, 39,683 have source coordinates and all 42,864 contribute ZIP and location-profile evidence. AAI status plus future expiration remains municipal-license evidence only, and record-level entities and profiles stay local-review-only.

The DC DLCP layer contributes one provisional organization, site, and establishment per accepted Customer Number group. Multiple Active Basic Business License activity rows remain assertions on that one establishment instead of becoming extra sites. Official MAR coordinates are transformed from EPSG:26985 and retained as source evidence without becoming a current-occupancy claim. Owner, agent, billing, parcel-lot, SSL, and rounded latitude/longitude fields are excluded at query time. Municipal-license status remains source-specific, record-level entities and profiles stay local-review-only, and aggregates require CC BY 4.0 attribution plus the retained semantic limitations.

The California ABC layer contributes 84,485 File Number-grouped provisional organizations, premises, establishments, and location profiles from 129,017 daily-export rows. The source connector selects 105,654 rows marked both ACTIVE and LIC, excludes 23,363 other rows, publishes 105,417 license activities, and quarantines 237 rows across 215 conflicting or invalid File Number groups. Multiple license-type rows remain assertions on one File Number site instead of becoming extra sites. The source retains 3,939 ACTIVE rows whose reported expiration predates observation as an explicit discrepancy rather than silently changing source status. No premise coordinates are present, so these profiles contribute reported-state and ZIP evidence but no coordinate-derived county assignments. Mailing fields are discarded, record-level entities and profiles remain local-review-only, and aggregate redistribution requires California ABC attribution plus the retained license-scope and privacy limitations.

The New York Agriculture and Markets retail-food layer contributes 24,281 licensed organizations from the annual current snapshot. It creates 24,230 conditional sites, establishments, and location profiles from complete numbered physical addresses; 24,280 rows contribute ZIP evidence. The source reports 22,999 usable platform geocodes, of which 22,948 belong to site-eligible profiles and receive one generalized county assignment; 51 coordinates belong to records whose incomplete address prevented site inference. One assigned point conflicts with the source-reported state, so both observations remain visible. Nineteen rows retain undocumented establishment code `Y` without interpretation. Record-level evidence remains local-review-only, and aggregates require OPEN-NY attribution plus the snapshot, privacy, service-inference, and address-component-centroid limitations.

The NYC DCWP layer contributes 31,163 grouped license sites and Business Unique ID organizations from 35,245 Active/Premises license rows. It accepts 34,397 license rows and quarantines 848 rows across 665 business groups with incomplete, invalid, or conflicting address evidence. Multiple active premise licenses remain assertions on one business/site/establishment instead of becoming extra sites. Of the accepted sites, 26,532 have source coordinates and all 31,163 contribute ZIP and location-profile evidence. Active/Premises remains municipal-license evidence only, and record-level entities and profiles stay local-review-only.

Gap rows are first-class data. They include global blockers, inherited registry limitations, per-source coordinate gaps, ZIPs without record-level contributions, source-reported five-digit postal values outside the Census ZCTA5 polygon denominator, ZIPs without employer baselines, ZCTA overlay diagnostics, and county equivalents without ZCTA intersections. Missing optional USPS routing evidence is not a spatial-denominator gap.

## Management page and read-only API

The Co*Tive Collector management page exposes the current verified release in the **U.S. business coverage** panel. Operators can search and page through states, counties, ZIPs, source summaries, and coverage gaps without loading the large ZIP artifact into the browser. County filters accept a two-digit state FIPS code; ZIP search is a numeric prefix; gap rows can be narrowed to one declared gap type. State, county, and source views show the Nonemployer baseline separately from source-preserving profiles.

The separate **Business heat maps** section uses this same governed release with the pinned Census polygons to provide state → county → ZCTA navigation, source-category heat values, population and housing enhancers, ZIP-scoped physical-location name review, and cross-state category percentages. It excludes ambiguous ZCTAs from jurisdiction aggregates instead of area-allocating people or businesses. See [`BUSINESS-HEAT-MAPS.md`](BUSINESS-HEAT-MAPS.md).

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

The coverage publisher 2.7.0 release is aligned to national registry 2.9.0, its independently verified entity-resolution release, the current deterministic benchmark sample, and the complete selected Census ZCTA5 geography release. It makes that verified Census set the explicit spatial ZIP polygon denominator, treats USPS operational data as optional routing evidence, and declares ZIP+4 non-geometric. The manifest explicitly labels registry 2.9.0 as a pre-migration postal-field dependency; corrected generators and registry publisher 2.10.0 are ready, but the historical 2.9.0 artifacts have not been rewritten.

Release `national-business-coverage-views-20260902-115337634Z-ba689784` publishes seven independently verified artifacts totaling 583,847,348 bytes. It contains three national scopes, all 56 state equivalents, all 3,235 county equivalents, all 48,217 registry ZIP rows, 26 source views, and 28,127 explicit gap rows. Its denominator records the pinned geography-manifest hash, ZCTA-index artifact hash, and deterministic ZCTA member-set hash; verification requires exact included-member and excluded-gap set equality.

The publisher assessed all 8,011,827 source-preserving location profiles. Source-reported address states match a supported Census state equivalent for 8,011,436 profiles; 391 remain missing or unsupported. Exactly 1,035,455 profiles carry valid points, 995,268 have one county assignment, 40,180 fall outside every generalized county polygon, and seven sit on ambiguous county boundaries. Fifty profiles have a conflict between their reported state and coordinate-derived county state; both observations remain visible. New York retail food contributes 24,230 reported-state profiles: 22,948 carry platform address-component centroids and receive one county assignment, while 1,282 have no retained profile point. California ABC contributes 84,485 reported-state profiles without coordinates. DC contributes 54,890 profiles: 42,749 carry valid transformed coordinates, 42,748 receive one county assignment, one coordinate is invalid, and one valid point is outside the generalized county polygons. Alaska contributes 94,486 reported-state profiles without coordinates. NYC DCWP contributes 31,163 profiles, including 26,519 with one county assignment and four retained state conflicts. Chicago contributes 42,864 profiles, including 39,683 with one county assignment and 32 retained conflicts.

County point coverage currently comes from SNAP, FDIC, FSIS, Los Angeles, Chicago BACP, DC DLCP, New York retail food, and NYC DCWP profile layers. The current registry match-profile layer carries no point for California ABC, Alaska, NPPES, ECHO, FMCSA, or NCUA, so their point-missing profiles are not silently placed in counties. New York platform points remain labeled address-component centroids and do not become premise-accuracy claims. ECHO retains source-reported coordinates and precision metadata in its own governed assertion layer, but those assertions are not generalized into premise-level match-profile points.

Of the 48,217 ZIP-view rows, 48,018 have record-level source contributions and 199 are denominator-only. Exact five-digit matching reconciles all 33,791 records in the selected Census ZCTA5 polygon release; those 33,791 records are the spatial denominator. The other 14,426 rows are source-reported five-digit postal values outside that polygon set and are not promoted into it. Census ZBP publishes an employer baseline for 34,954 rows; 13,263 retain an explicit unpublished or missing-baseline gap. Any percentage over the polygon set must be labeled Census ZCTA5 coverage. Optional USPS operational evidence may supplement routing status later, but its absence does not block spatial coverage. ZIP+4 remains a separate address-level field and never receives polygon membership.

The release also pins the verified 2023 Census Nonemployer baseline. It exposes 30,427,808 annual no-paid-employee establishments at the national/51-state-and-D.C. scope and 30,427,807 across 3,143 published county totals. One establishment remains unallocated to county, five state equivalents and 92 county equivalents remain outside the source geography scope, and no Nonemployer value is assigned to a ZIP.

The release remains local aggregate, partial, and non-deduplicated. Connecticut, Delaware, Colorado, Washington L&I, Iowa, New York corporate, Florida, and Pennsylvania organization addresses plus Oregon organization/brand addresses stay out of physical-site state/county counts and remain explicit in the entity-only allocation gap. Those sources contribute no location profiles. New York retail food, California ABC, DC DLCP, Alaska, Los Angeles, Texas permit outlets, Chicago licensed sites, and NYC DCWP licensed sites contribute source-preserving profiles under local-review-only policies; California, Alaska, and Texas contribute no coordinates, while Los Angeles, Chicago, DC, New York retail food, and NYC contribute source coordinates. Washington-derived aggregates require Labor & Industries attribution under PDDL and retained contractor-license/mailing-address limitations; New York retail-food aggregates require OPEN-NY attribution and retained source limitations; California-derived aggregates require source attribution and retained license-scope limitations; DC-derived aggregates require CC BY 4.0 attribution; and Alaska-derived aggregate distribution remains review-required. The identity gate records zero benchmark labels, entity resolution unapplied, and export authorization false.
