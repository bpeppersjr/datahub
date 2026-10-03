# NPPES pharmacy registry overlay

This pointer-free retained-evidence release classifies the 89,077 CMS NPPES organization NPIs carrying community/retail pharmacy taxonomy `3336C0003X` without adding them again to the national business registry.

Every pharmacy NPI is replayed against the exact August 2026 NPPES organization artifacts already pinned by national registry release `national-business-registry-20260911-022652067Z-1ec656c3`. All 89,077 resolve to the same source-defined organization identity. Consequently, organization, site, establishment, and generic-business additivity deltas are all zero.

The release contains:

- `membership.jsonl`: exact NPI-to-existing-organization classification rows;
- `jurisdictions.jsonl`: 56 source-reported state or territory aggregates, explicitly nonadditive;
- `zip5-overlay.jsonl`: all 48,194 governed ZIP-denominator cohort keys, including explicit zero-observation rows.

The 15,376 positive ZIP5 rows are source-reported postal evidence. They do not establish current USPS validity or deliverability. ZIP+4 remains separate in the upstream source and is not represented as geometry.

## Claim boundary

The source proves active NPI enumeration and pharmacy taxonomy reporting as of August 9, 2026. It does not prove pharmacy licensure, current operation, physical premises, unique-business identity, or nationwide completeness. Parent-organization text is not an ownership determination. NABP/NCPDP numbers, drive-through service, and network affiliation are unavailable. The 852 organizations and 867 assertions carrying taxonomy `3336M0002X` provide mail-order taxonomy evidence only.

No network request, acquisition, pointer publication, production enrollment, production execution, entity merge, site creation, or application mutation is performed.
