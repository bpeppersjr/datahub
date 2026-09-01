# Governed business entity resolution

The entity-resolution layer groups provisional source entities without deleting or overwriting them. Every decision is versioned, evidence-backed, reversible, policy-scoped, and tied to an immutable National Business Registry release.

## Match profiles

Compatible registry publisher versions 1.2.0 through 2.7.0 emit one compact location profile for every provisional physical site and establishment. State-registration organization and brand layers added in 1.3.0 through 1.9.0, plus Delaware current-license organizations added in 2.4.0, do not create profiles. Publisher 2.0.0 adds privacy-restricted Los Angeles Office of Finance locations, 2.1.0 adds Texas Comptroller permit outlets and their taxpayer-organization links, 2.2.0 adds grouped City of Chicago BACP license-account/site profiles, 2.3.0 adds grouped NYC DCWP Active Premises-license Business Unique ID profiles, 2.5.0 adds conditional Alaska DCCED active-license site profiles only for complete source-reported U.S. physical street addresses, 2.6.0 adds grouped DC DLCP Active Basic Business License Customer Number/site profiles with official MAR coordinate evidence, and 2.7.0 adds California ABC active issued-license premises grouped by File Number only when the source reports a complete eligible U.S. physical street address. All seven location-source policies remain local-review-only throughout resolution. Profiles are partitioned into 100 ZIP2 files and contain:

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
```

The resolution publisher writes 100 immutable ZIP2 decision partitions and one aggregate summary. The verifier independently checks every hash and decision, recomputes deterministic decision IDs and review scores, validates rule-specific evidence and provenance, prevents duplicate partitions, decision IDs, or multiple automatic targets for one provisional entity, reconciles counts, and rejects non-reversible or exportable decisions.

The layer remains `published-reviewable-partial`. It does not claim all entities have been resolved, and it does not infer ownership, parent company, general operating status, or identity from a name alone.

## Validated live release

The independently verified release `business-entity-resolution-20260901-220445526Z-9e963ee0` depends on registry release `national-business-registry-20260901-194822229Z-ea15e7dd`. Across 7,987,597 profiles and 6,493,936 usable address groups, it publishes 2,304,658 reversible site-alias decisions, 141,204 reversible establishment-alias decisions, and 98,549 unapplied review candidates in 100 decision partitions plus one aggregate summary. Two oversized residual review groups were skipped and counted; no automatic decision was created for them. The 101 verified artifacts total 407,581,097 bytes. California ABC adds 84,485 complete, local-review-only premises profiles without source coordinates. Relative to the preceding provisional build that omitted California street fields from match keys, the corrected profiles add 56,999 address groups, 13,405 multi-member street-address groups, 40,891 site-alias decisions, 15,434 establishment-alias decisions, and 11,633 review candidates. DC DLCP, Alaska, NYC DCWP, Chicago, Texas, and Los Angeles profiles also remain local-review-only; Delaware and the other organization-only state layers create no location profiles.

These are decision-row counts, not counts of unique resolved businesses. The release remains incomplete and local-review-only.

## Benchmark gate

Decisions remain `local-review-only` until the independently labeled [`national-business-entity-resolution-benchmark`](ENTITY-RESOLUTION-BENCHMARK.md) demonstrates the automatic-link precision threshold and each contributing source policy permits the intended export. The live deterministic sample is verified but has no submitted labels, so the precision gate is false. A later operator-review workflow may affirm or reject candidates by publishing new decisions; it must retain earlier evidence instead of mutating history.
