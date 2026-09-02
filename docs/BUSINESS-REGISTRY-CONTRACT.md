# National business registry contract

The national business registry is a governed view assembled from source assertions. It is not a scraped flat file and does not claim that absence from one source means a business is closed.

## Canonical entities

The registry keeps these identities separate:

- **Organization:** legal or controlling entity.
- **Brand:** public-facing trade identity.
- **Physical site:** addressable place and coordinates.
- **Establishment:** an operating business activity at a site.
- **Service:** a capability such as retail pharmacy, grocery, drive-through, or mail order.

A grocery store containing a pharmacy is one physical site with at least two establishments. An NPI, NCPDP ID, SNAP retailer ID, state license, Google Place ID, or source-native ID is an external identifier assertion—not the canonical primary key.

## Active status

“Active” is a time-bounded conclusion supported by assertions. Each source reports what it knows and when it observed it. The published view must distinguish:

- affirmative operating evidence;
- active license or program participation;
- inactive, closed, revoked, or expired evidence;
- stale evidence;
- conflicting evidence;
- no evidence.

The system stores `valid_from`, `valid_to`, `observed_at`, `first_seen`, and `last_seen`. It never turns a missing record into a closure assertion.

## Source hierarchy

Source priority depends on the field, not a global winner:

1. Government registration, licensing, and enforcement sources for legal identity and regulated status.
2. Government program/provider registries for program participation and typed identifiers.
3. First-party business feeds and locators for brand, hours, and offered services when their terms permit collection.
4. Licensed national business/POI sources for broad record-level coverage.
5. Open geographic/community sources for gap discovery and corroboration under their licenses.
6. Restricted map/search providers for permitted verification and aggregate gap detection—not unrestricted permanent republication.

Conflicts remain separate assertions until a versioned resolution rule selects a published value. Every field retains its source record, release, ingest run, transformation version, policy, and export classification.

## ZIP coverage definition

Spatial ZIP-shaped coverage is measured over the complete selected Census-published ZCTA5 polygon set from a pinned, verified `us-census-geography` release. That set is the authoritative spatial polygon denominator within its declared Census layer and vintage. It is not an assertion that every USPS ZIP has a polygon or that a ZCTA is an exact delivery boundary. For each ZIP/ZCTA view, publish:

- the Census ZCTA5 denominator membership and vintage, or explicit no-ZCTA-polygon status for a source-reported ZIP5;
- optional USPS operational ZIP routing evidence and source when an authorized governed release is supplied;
- ZIP type when available, including standard, unique, military, and PO Box;
- state/county allocations with weights and quarter/vintage;
- Census employer-establishment denominator and NAICS coverage;
- record-level source counts, latest observations, conflicts, and unresolved gaps;
- whether the ZIP is excluded from a source by design.

ZIP+4 is retained only as a postal routing/address identifier. It has no polygon, must not inherit a ZCTA polygon, and is never counted as a spatial denominator unit.

The implemented USPS operational ZIP connector remains optional supplemental routing evidence. It uses the current PostalPro Area/District assignment file and reconciles it against the broader AISU routing file, excludes AISU-only rows from its scoped assignment set, and never provides polygon geometry. It requires an explicit authorized-use basis and keeps source and derived record-level rows local restricted unless reviewed USPS written permission covers export. Its absence does not block a verified Census ZCTA5 spatial denominator.

Any spatial percentage must name the exact denominator as the “complete selected Census ZCTA5 polygon set,” retain the Census layer, vintage, release ID, and manifest checksum, and preserve ZCTA statistical-boundary limitations. Percentages over “all valid USPS ZIP Codes” remain prohibited without a separately governed authoritative USPS source suitable for that exact claim. Even then, USPS routing evidence remains distinct from Census polygon coverage and must not be labeled address deliverability.

## Publication gates

A national release requires:

1. Immutable, checksummed source releases and run-scoped staging.
2. Schema and count validation with quarantine instead of silent loss.
3. Field-level provenance, temporal scope, and export policy.
4. Versioned deterministic identity rules before probabilistic matching.
5. Reversible merge decisions with evidence and confidence.
6. Coverage metrics by state, county, ZIP/ZCTA, industry, and source.
7. Explicit unresolved conflicts and source-specific exclusions.
8. No restricted fields in public exports.

Registry publisher 2.10.0 is also compatible with the entity-resolution layer. It centrally rejects joined ZIP5+4 aliases and requires a separate four-digit-or-null `zip4` component on normalized U.S. addresses.

Compatible registry publishers 1.2.0 through 2.9.0 emit source-preserving location match profiles as a separate derived input. Publishers 1.3.0 through 1.9.0 also add organization-or-brand state-registration evidence without creating location profiles. Publisher 1.7.0 preserves OPEN-NY policy on New York organization assertions; publisher 1.8.0 adds privacy-minimized Florida quarterly active-corporate assertions; publisher 1.9.0 adds privacy-minimized Pennsylvania active-registration assertions while retaining the statutory-overcount warning and treating portal geocodes as unverified evidence. Publisher 2.0.0 adds City of Los Angeles source-defined active location accounts as provisional sites and establishments. Publisher 2.1.0 adds Texas Comptroller taxpayer organizations and permitted outlets, with taxpayer mailing fields excluded and all record-level entities, assertions, relationships, and match profiles kept local-review-only. Publisher 2.2.0 adds City of Chicago BACP license-account organizations and account/site locations, groups multiple active license rows onto one site, honors publisher-redacted addresses through quarantine, and keeps all record-level entities, assertions, relationships, and match profiles local-review-only. Publisher 2.3.0 adds NYC DCWP Business Unique ID organizations and Active Premises-license sites with the same restricted record boundary. Publisher 2.4.0 adds Delaware Division of Revenue current-license organizations, groups repeated trade-name rows by license number, quarantines conflicting groups, excludes person/contact fields, and treats reported addresses and geocodes as local-review-only organization evidence without creating sites or relationships. Publisher 2.5.0 adds Alaska DCCED active-license organizations and creates provisional sites/establishments only from complete source-reported U.S. physical street addresses; it excludes owner, mailing, and contact fields, preserves license/NAICS evidence, and keeps record-level artifacts local-review-only while requiring review before aggregate distribution. Publisher 2.6.0 adds DC DLCP Customer Number organizations and premises, groups every Active Basic Business License activity onto one site, transforms official MAR coordinates from EPSG:26985, excludes owner/agent/billing/parcel fields at query time, keeps record-level artifacts local-review-only, and requires CC BY 4.0 attribution plus semantic limitations for aggregate redistribution. Publisher 2.7.0 adds California ABC active issued-license organizations and premises grouped by File Number, discards mailing fields before staging, creates conditional sites only from complete eligible U.S. physical street addresses, keeps record-level artifacts local-review-only, and requires California ABC attribution plus license-scope limitations for aggregate redistribution. Publisher 2.8.0 adds Washington L&I A/ACTIVE contractor-license organizations grouped by canonical nine-digit UBI, excludes principal/contact fields, retains mailing addresses as organization-only assertions, creates no sites, establishments, relationships, or profiles, and requires PDDL attribution plus contractor-license and mailing-address limitations for aggregate redistribution. Publisher 2.9.0 adds New York Agriculture and Markets retail-food-license organizations and conditional premises from complete numbered physical addresses, keeps all record-level artifacts local-review-only, treats platform geocodes as address-component centroids, preserves undocumented code values without interpretation, and requires OPEN-NY attribution plus license-snapshot limitations for aggregate redistribution. The entity-resolution publisher records exact-address aliases, exact address-and-name aliases, and unapplied review candidates in immutable decision artifacts. It never rewrites provisional entity IDs or source assertions. Automatic links remain reversible, fuzzy evidence remains review-only, and record-level linkage remains local until benchmark precision and every contributing source policy authorize an export.

The machine-readable contracts are [`business-entity.schema.json`](../config/schemas/business-entity.schema.json), [`business-assertion.schema.json`](../config/schemas/business-assertion.schema.json), and [`business-relationship.schema.json`](../config/schemas/business-relationship.schema.json).
