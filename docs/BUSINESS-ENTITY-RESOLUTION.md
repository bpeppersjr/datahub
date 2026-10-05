# Governed business entity resolution

The entity-resolution layer groups provisional source entities without deleting or overwriting them. Every decision is versioned, evidence-backed, reversible, policy-scoped, and tied to an immutable National Business Registry release.

## Match profiles

Current profiles use `business-location-match-profile@1.1.0`. The canonical address has an exact five-digit `zip_code`, an identical exact five-digit `postal_code`, and a separate four-digit-or-null `zip4`; combined ZIP+4 strings are not accepted. Coordinates are serialized only as `geocode: { latitude, longitude }` or `null`, with latitude/longitude ranges checked. Profile, address, normalized-address, and source objects are closed-key contracts; geometry/polygon keys are rejected.

The immutable national registry release `national-business-registry-20260911-022652067Z-1ec656c3` (manifest SHA-256 `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`) remains readable through an explicit v1.0 compatibility path. Its legacy Point values are accepted only as exact EPSG:4326 `[longitude, latitude]` points; exact explicit latitude/longitude pairs and nulls are also preserved. Readers project these rows to the v1.1 geocode shape without rewriting source bytes. Historical assertion `value_type: geometry` is similarly limited to this exact release and point-only input; new assertions use `geocode`.

Compatibility extends through registry publisher 2.15.0. Publisher 2.10.0 adds the mandatory split ZIP5/ZIP4 address contract, while 2.11.0 adds optional Illinois organization-only evidence without changing entity-resolution match-key semantics. Publishers 2.12.0 through 2.15.0 add governed reporting-only childcare locations, including Tennessee and Ohio: physical sites must equal eligible matching profiles plus validated reporting-only locations. Reporting-only rows remain outside resolution and benchmark candidate selection; historical versions retain their original one-profile-per-site invariant.

Compatible registry publisher versions 1.2.0 through 2.15.0 emit one compact location profile for every identity-matching-eligible provisional physical site and establishment. State-registration organization and brand layers added in 1.3.0 through 1.9.0, Delaware current-license organizations added in 2.4.0, Washington L&I contractor-license organizations added in 2.8.0, and Illinois registration organizations added in 2.11.0 do not create profiles. Publisher 2.0.0 adds privacy-restricted Los Angeles Office of Finance locations, 2.1.0 adds Texas Comptroller permit outlets and their taxpayer-organization links, 2.2.0 adds grouped City of Chicago BACP license-account/site profiles, 2.3.0 adds grouped NYC DCWP Active Premises-license Business Unique ID profiles, 2.5.0 adds conditional Alaska DCCED active-license site profiles only for complete source-reported U.S. physical street addresses, 2.6.0 adds grouped DC DLCP Active Basic Business License Customer Number/site profiles with official MAR coordinate evidence, 2.7.0 adds California ABC active issued-license premises grouped by File Number only when the source reports a complete eligible U.S. physical street address, and 2.9.0 adds New York Agriculture and Markets retail-food-license premises only when the source reports a complete numbered physical street address. All restricted location-source policies remain local-review-only throughout resolution. Profiles are partitioned into 100 ZIP2 files and contain:

- provisional site, establishment, and optional operating-organization IDs;
- the reported address and a deterministic normalized address;
- source-reported names and conservative normalized name tokens;
- source identifiers, status, observation time, and complete provenance; and
- the contributing source export policy.

Profiles do not replace source assertions. Their total must exactly equal the registry physical-site count.
Reported locations with a valid ZIP but no usable complete street address remain in the profile dataset with a null match key. They are counted as coverage but are ineligible for automatic links and review candidates; the publisher does not invent an address or silently discard the source entity.

## Automatic rules

Ruleset `business-entity-resolution@1.0.0` has two automatic rules:

1. Physical sites receive a shared resolved-site alias when their complete normalized street address is exactly equal, including a reported unit. PO Boxes and rural-route-style records are ineligible.
2. Establishments receive a shared resolved-establishment alias only when the eligible address and non-generic normalized name are both exact and no contributing source release has more than one member in the group.

Resolved IDs and decision IDs are deterministic hashes of rule inputs. Each provisional member gets an `automatic-link` decision with score `1`, complete rule evidence, and `reversible: true`.

A shared physical site never by itself merges establishments. Grocery stores, in-store pharmacies, banks, clinics, and other co-located operations remain separate unless independent name evidence supports a match.

## Scored review candidates

Within an exact eligible address, name pairs not eligible for an automatic establishment link are compared with token Jaccard and character-bigram Dice evidence. This includes similar non-exact names as well as exact names withheld because they are generic or source-ambiguous. The total candidate score is 55% exact-address evidence and 45% name similarity. A total of at least `0.78` creates `review-candidate`; it never creates an automatic link.

Large address groups are bounded. Groups over 50 profiles are re-blocked by a significant name token, and oversized residual groups are skipped and counted rather than expanded quadratically.

## Publication and verification

```powershell
npm run registry:build
npm run registry:verify
npm run entity-resolution:build
npm run entity-resolution:verify
npm run entity-resolution:verify-source-replay -- <resolution-manifest.json> <registry-manifest.json>
```

The resolution publisher writes 100 immutable ZIP2 decision partitions and one aggregate summary. The verifier independently checks every hash and decision, recomputes deterministic decision IDs and review scores, validates rule-specific evidence and provenance, prevents duplicate partitions, decision IDs, or multiple automatic targets for one provisional entity, reconciles counts, and rejects non-reversible or exportable decisions.

The separate source-bound replay verifier requires explicit resolution and registry manifest paths. It verifies the exact registry manifest hash/release dependency, revalidates all 100 registry profile partitions and reporting-only exclusions, recomputes every partition with the retained resolution timestamp, and compares the complete decision rows and aggregate counters. It fails closed when a decision is omitted even if the derivative decision artifact, summary, manifest counts, and hashes are all consistently rewritten. This is offline verification and performs no acquisition, publication, or pointer change.

The layer remains `published-reviewable-partial`. It does not claim all entities have been resolved, and it does not infer ownership, parent company, general operating status, or identity from a name alone.

## Validated live release

The independently verified release `business-entity-resolution-20260911-040411512Z-e6812503` depends on registry release `national-business-registry-20260911-022652067Z-1ec656c3` with exact manifest SHA-256 `d8ab131697b1df63ed53fdfa9832d6973fd152ddf23565219ee9bb39b25fbb76`. Source-bound replay verified all 8,011,835 profiles and reproduced 2,578,153 complete decision rows: 2,325,194 reversible site-alias decisions, 146,896 reversible establishment-alias decisions, and 106,063 unapplied review candidates. The profiles form 6,505,544 address groups, including 876,086 multi-member street-address groups. Two oversized residual review groups were skipped and counted; no automatic decision was created for them. The 101 verified artifacts total 412,594,557 bytes.

These are decision-row counts, not counts of unique resolved businesses. The release remains incomplete and local-review-only.

## Benchmark gate

Decisions remain `local-review-only` until the independently labeled [`national-business-entity-resolution-benchmark`](ENTITY-RESOLUTION-BENCHMARK.md) demonstrates the automatic-link precision threshold and each contributing source policy permits the intended export. The live deterministic sample is verified but has no submitted labels, so the precision gate is false. A later operator-review workflow may affirm or reject candidates by publishing new decisions; it must retain earlier evidence instead of mutating history.
