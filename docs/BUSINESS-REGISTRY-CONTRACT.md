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

Coverage is measured over an authoritative current ZIP denominator once one is licensed or acquired through an authorized source. For each ZIP, publish:

- current-validity evidence and source;
- ZIP type when available, including standard, unique, military, and PO Box;
- ZCTA polygon or explicit no-polygon status;
- state/county allocations with weights and quarter/vintage;
- Census employer-establishment denominator and NAICS coverage;
- record-level source counts, latest observations, conflicts, and unresolved gaps;
- whether the ZIP is excluded from a source by design.

The implemented USPS operational ZIP connector uses the current PostalPro Area/District assignment file as a precisely scoped denominator and reconciles it against the broader AISU routing file. It does not equate assignment membership with address-level deliverability, and it excludes AISU-only routing rows. The connector requires an explicit authorized-use basis and keeps source and derived record-level rows local restricted unless reviewed USPS written permission covers export.

Until a governed USPS release is actually integrated into a registry release, coverage percentages over “all valid ZIPs” remain prohibited. After integration, any percentage must name the exact denominator as “current USPS Area/District 5-digit ZIP assignments,” inherit its source month and export policy, and must not be labeled address-deliverability coverage. ZCTA and ZBP unions may be reported only with their exact denominators.

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

Compatible registry publishers 1.2.0 through 2.0.0 emit source-preserving location match profiles as a separate derived input. Publishers 1.3.0 through 1.9.0 also add organization-or-brand state-registration evidence without creating location profiles. Publisher 1.7.0 preserves OPEN-NY policy on New York organization assertions; publisher 1.8.0 adds privacy-minimized Florida quarterly active-corporate assertions; publisher 1.9.0 adds privacy-minimized Pennsylvania active-registration assertions while retaining the statutory-overcount warning and treating portal geocodes as unverified evidence. Publisher 2.0.0 adds City of Los Angeles source-defined active location accounts as provisional sites and establishments while keeping record-level entities, assertions, relationships, and match profiles local-review-only. The entity-resolution publisher records exact-address aliases, exact address-and-name aliases, and unapplied review candidates in immutable decision artifacts. It never rewrites provisional entity IDs or source assertions. Automatic links remain reversible, fuzzy evidence remains review-only, and record-level linkage remains local until benchmark precision and every contributing source policy authorize an export.

The machine-readable contracts are [`business-entity.schema.json`](../config/schemas/business-entity.schema.json), [`business-assertion.schema.json`](../config/schemas/business-assertion.schema.json), and [`business-relationship.schema.json`](../config/schemas/business-relationship.schema.json).
