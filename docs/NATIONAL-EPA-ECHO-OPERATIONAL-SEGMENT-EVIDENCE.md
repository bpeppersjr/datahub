# EPA ECHO operational-segment evidence

`national-epa-echo-operational-segment-evidence@1.0.0` replays the original retained EPA ECHO normalized facility shards and classifies source-reported NAICS through a pinned, six-edition Census reference. It builds locally with zero network requests. It contributes supplemental environmental-program facility evidence for construction, retail, finance, transportation, health care and childcare.

Run `npm run epa-operational-segments:build` to produce a new immutable review release. Run `npm run epa-operational-segments:verify -- --manifest <retained-manifest-path>` to independently replay it. Builds never change a current pointer, production enrollment or the main exact-ZIP matrix. The application can run these standalone Node scripts without a Codex session.

## Classification and edition handling

Every reported 2–6 digit code must be present in at least one of the retained Census vocabularies: 1997, 2002, 2007, 2012, 2017 and 2022. The historical references are Census SUSB-published vocabularies; they carry the reference foundation's scope limitations. Absence across these six vocabularies means `invalid-in-all-reference-editions`, rather than a claim of invalidity across every possible NAICS edition or country implementation.

For each edition containing a code, the pinned crosswalk checks the relevant published hierarchy title. All containing editions must resolve consistently. A code confined to an older edition can still supply segment evidence; this does not assign an edition to the EPA record. `code-validation.jsonl` preserves all matching editions, original code/title evidence, and resolution status. No concordance or primary classification is inferred.

The four source-reported component sectors 44, 45, 48 and 49 are explicitly represented by the published combined sectors 44-45 and 48-49 where a direct code row is absent. Their validation records distinguish `combined-sector-component` from `direct-reference-member` and retain the actual published reference code. No other missing code is repaired by prefix expansion. Other exact validated descendants may be classified by their governed hierarchy prefix.

Rules are construction 23, retail 44/45, finance 52, transportation 48/49, health care 621/622/623, and childcare 6244. The 2022 childcare title `Child Care Services` and historical `Child Day Care Services` both support the same explicit childcare rule. Broad 62 and 624 do not imply health care or childcare. Childcare is disjoint from this strict health-care scope. Tax-exempt organizations, sales-tax outlets and local business licenses require other source evidence and remain unmapped.

## Source-record counting

Each accepted source record contributes at most once to each segment, even if multiple reported codes trigger the same segment. Triggering-code counts remain available and can overlap within a segment. Segment counts overlap across records with different classifications; there is no primary segment and their sum is not a unique-business count.

The exclusive record statuses conserve all 1,517,826 accepted records. Precedence is:

1. `missing-naics`: no reported codes.
2. `multisegment`: more than one deduplicated segment, whether or not other codes are unmapped.
3. `partially-unmapped`: exactly one mapped segment plus one or more unmapped codes.
4. `mapped`: exactly one mapped segment with all codes resolved to it.
5. `invalid-in-all-reference-editions`: every reported code absent from all supported reference vocabularies.
6. `unresolved-naics-edition`: no mapped segment and at least one inconsistent hierarchy interpretation.
7. `valid-outside-operational-segments`: no mapped segment, with some valid code outside the selected rules; additional invalid codes remain visible in code-validation evidence.

`records_partially_unmapped` also includes multisegment records with unmapped codes. `records_with_segment` includes mapped, partially-unmapped and multisegment statuses. The 501,976 missing-NAICS records remain visible rather than disappearing from industry reporting.

The verified national release maps 294,477 records to 296,595 record-by-segment memberships, including 2,107 multisegment records. Counts by segment are construction 93,917; retail 124,323; finance 1,888; transportation 47,049; strict health care 29,241; childcare 177. The exclusive status counts are missing 501,976; invalid 13,577; unresolved 0; valid outside selected segments 707,796; mapped 268,041; partially unmapped 24,329; multisegment 2,107. Supplemental `records_partially_unmapped` is 25,035 because it also includes 706 multisegment records with unmapped codes. There are 50,277 positive ZIP-by-segment cells.

## Geography and retained artifacts

The release contains a national summary, all 51 state/D.C. rows, five separate territory rows, all 48,194 ZIP-cohort rows, ten sparse ZIP-by-segment shards, exact code-validation evidence, and explicit missing-ZIP/out-of-cohort sidecars. States use reported source jurisdiction; ZIP or ZCTA membership never assigns state. Non-ZCTA and placeholder classifications survive unchanged. ZIP4 is separate and is null in this accepted source release.

The missing-ZIP and out-of-cohort sidecars are empty because this exact accepted normalized release has no such records. That does not mean the original exporter had no source exclusions. The retained source manifest separately reports 1,659,426 active-Y records and 141,600 quarantined records: 92,746 missing physical addresses, 33,423 invalid U.S. state/territory values, 15,417 missing registry IDs and 14 missing facility identities. Those upstream records remain governed by the original source release and are not silently admitted by this derivative.

## Publication, verification and app integration

All inputs are manifest pinned. The crosswalk, original replay configuration, Census reference manifest and artifact roster have explicit SHA-256 bindings. Census native source and derived code bytes are independently replayed before classification. Original source identifiers are checked for duplicates across shards, then used only in bounded validation memory. Published aggregates contain no source identifiers, facility names, addresses, coordinates or geometries.

Publication takes an exclusive local lock, writes invocation-owned staging, emits the manifest last, independently reconstructs every artifact, and renames atomically to its content-addressed release ID. Cancellation and injected source/output/post-manifest failures remove only owned staging/verification paths. A stale lock is not automatically removed; inspect it before an explicit recovery. Historical releases are never overwritten.

The dataset is registered for local review. A follow-up application integration should expose these counts in a separate supplemental block under the six applicable Industry Status programs, with state/national context and exact release provenance. It must preserve the existing source-dimension denominators, percentages and unmapped `regulated_facilities` matrix dimension. A code-validation download must retain the exact component-sector distinction and edition uncertainty.

Evidence is source-defined active environmental-program facility evidence as of August 30, 2026. Unique businesses, independently verified sites, general current business operation, industry completeness and USPS validity remain unmeasured. Counts add zero to generic business totals. Missing geography, population or nationwide business denominators do not block this evidence.

Rollback removes only this registration from consumers or selects an earlier immutable supplemental release; historical main-matrix and operational-industry summary contracts continue unchanged.
