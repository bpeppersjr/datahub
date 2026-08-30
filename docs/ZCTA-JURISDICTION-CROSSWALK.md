# Census ZCTA jurisdiction crosswalk

`us-census-zcta-jurisdiction-crosswalk` is the governed spatial bridge between the national Census geography foundation and jurisdiction-level coverage views. It relates every published 2020 Census ZCTA polygon to every current Census county and state equivalent whose polygon it intersects.

This dataset is deliberately an **area overlay**, not an address or business allocation. A 40% polygon-area weight means 40% of the matched ZCTA polygon area intersects that county; it does not mean 40% of the ZCTA's people, addresses, employers, or businesses are in that county.

## Build and verify

The publisher makes no network requests. It consumes the complete release referenced by `data/geography/current.json` and writes generated artifacts inside `datahub/data/zcta-jurisdiction-crosswalk`:

```powershell
npm run zcta-crosswalk:build
npm run zcta-crosswalk:verify
```

Use explicit paths when needed:

```powershell
npm run zcta-crosswalk:build -- --geography data/geography/current.json --output data/zcta-jurisdiction-crosswalk
npm run zcta-crosswalk:verify -- data/zcta-jurisdiction-crosswalk/current.json
```

Each build publishes an immutable release and atomically updates `current.json`. The verifier recomputes every artifact hash, requires the complete artifact set, rejects duplicate relationships, and verifies that normalized weights sum to one for every matched ZCTA.

## Method

1. Load all current Census county/county-equivalent polygons into an R-tree using their EPSG:4326 bounding boxes.
2. Read the ten ZCTA GeoJSON partitions one at a time.
3. Use bounding-box search to select candidate counties, then calculate the actual polygon intersection with `polygon-clipping`.
4. Measure the resulting intersection geometry with Turf's geodesic-area calculation.
5. Publish the raw share of the ZCTA polygon and a normalized share over all matched county intersections.
6. Classify a ZCTA as `complete-within-tolerance` when its total matched-area ratio is 0.995 through 1.005; retain all partial, overlapping, and unmatched cases as diagnostics.
7. Preserve every positive topological intersection, while separately marking an intersection as material when it covers at least 0.1% of the ZCTA polygon. This keeps cross-jurisdiction analysis from confusing tiny boundary-vintage/generalization slivers with meaningful crossings.

The raw ratio exposes gaps or overages caused by using current county boundaries with 2020 ZCTAs and by the upstream generalized geometry. Normalization makes matched relationships add to one without concealing that raw diagnostic.

## Artifacts

```text
data/zcta-jurisdiction-crosswalk/
|-- current.json
`-- releases/<release-id>/
    |-- manifest.json
    `-- derived/
        |-- zcta-county-area-weights.jsonl
        |-- zcta-overlay-summary.jsonl
        |-- county-overlay-summary.jsonl
        `-- state-overlay-summary.jsonl
```

`zcta-county-area-weights.jsonl` contains one record per nonzero ZCTA/county intersection. Stable typed IDs preserve the ZCTA, county, and state relationship. Both weight fields use the explicit `polygon-area-only-not-business-location` semantic marker. `material_intersection` is an analytical threshold, not permission to discard the underlying topological relationship.

The three summary artifacts retain every upstream ZCTA, county equivalent, and state equivalent, including jurisdictions with no ZCTA intersection. They provide counts and area diagnostics for later national/state/county/ZIP coverage-gap views.

## Required interpretation

- A ZCTA is a Census statistical approximation, not a USPS ZIP Code delivery boundary.
- Valid USPS ZIP Codes without ZCTA polygons are absent and require a separately authorized operational ZIP assignment source.
- Do not assign a ZCTA to only its dominant county when a complete many-to-many relationship is required.
- Do not multiply business counts by polygon-area weights and call the result a known county business count. Address-level geocoding or an authorized address-based crosswalk is required for that claim.
- Current and historical releases remain tied to the exact upstream geography release and its manifest SHA-256 digest.

The tracked contracts are [`config/datasets/us-census-zcta-jurisdiction-crosswalk.json`](../config/datasets/us-census-zcta-jurisdiction-crosswalk.json) and [`config/connectors/us-census-zcta-jurisdiction-crosswalk.json`](../config/connectors/us-census-zcta-jurisdiction-crosswalk.json). The inherited source policy is [`config/source-policies/us-census-geography.json`](../config/source-policies/us-census-geography.json).

## Current verified release

Release `us-census-zcta-jurisdiction-crosswalk-20260830-222631137Z-4b9227f8` is tied to geography release `us-census-geography-20260830-132803990Z-3629abc0`. Its four artifacts contain 65,631 ZCTA/county relationships covering all 33,791 upstream ZCTAs, all 3,235 county equivalents, and all 56 state equivalents. The verifier checksummed 74,392,285 bytes.

Of the ZCTAs, 33,788 have a matched-area ratio inside the 0.995–1.005 tolerance, three retain explicit partial/overlapping diagnostics, and none is unmatched. The complete topology has 19,344 ZCTAs with more than one county intersection and 3,190 with more than one state intersection; after the documented 0.1% material threshold, those counts are 10,277 and 184. Two county equivalents—Rose Island in American Samoa and Northern Islands Municipality in the Northern Mariana Islands—have no ZCTA intersection and remain present with zero relationship counts.
