# Texas active sales-tax permit outlets

The Texas connector targets the official Comptroller of Public Accounts [Active Sales Tax Permit Holders](https://data.texas.gov/d/jrea-zgmq) dataset (`jrea-zgmq`). The catalog marks the table Public Domain and identifies each row as a taxpayer/outlet pair with an active permit under Texas Tax Code Chapter 151, Subchapter F.

## Source meaning and canonical model

An active sales-tax permit is source-specific regulatory evidence. It does not prove continuous operations, current occupancy, public access, solvency, or compliance with every other licensing requirement.

Each accepted row creates a provisional taxpayer organization, permitted establishment, and physical-site candidate. The taxpayer number plus outlet number is the source identity. The source explicitly describes the outlet address as physical, so the connector may create source-linked `operates` and `located_at` relationships; it does not infer a parent company or cross-source identity.

## Privacy and selected fields

Taxpayer and outlet names can identify sole proprietors, and physical outlet addresses can be residences. Record-level source, normalized, registry, relationship, and match-profile data therefore remains `local-review-only`. Aggregate ZIP and source counts may be shared with provenance and the source limitations.

The connector deliberately excludes taxpayer address, city, state, ZIP, and county fields at query time. It selects only taxpayer identity/name/type plus outlet identity/name, physical address, geography, NAICS, city-limits indicator, permit date, and first-sales date. Phone, email, owner, officer, and registered-agent fields are not present in the selected source.

PO boxes, incomplete addresses, invalid states, invalid ZIPs, ZIPs absent from the governed Census baseline, duplicate taxpayer/outlet identities, unexpected city-limit indicators, and schema or source-refresh drift cannot silently become physical sites.

## Build and verify

```powershell
npm run tx-sales-tax:build
npm run tx-sales-tax:verify
```

The publisher pages in deterministic taxpayer/outlet/source-row order, applies bounded retries only to transient failures, checks metadata and source count before and after acquisition, writes run-scoped checksummed artifacts, and changes `current.json` only after independent verification.

## Current verified release

Release `tx-active-sales-tax-20260831-235045220Z-c067b3eb` captures source release `tx-active-sales-tax-2026-08-29-98b90d177d81493e`. Of 885,278 taxpayer/outlet rows, 885,097 become provisional outlets and 700,705 distinct taxpayer organizations across 2,156 accepted ZIPs. The 181 quarantines comprise 170 ZIPs outside the governed ZBP/ZCTA union, 10 missing or nonphysical outlet addresses, and one invalid state. City-limit evidence is preserved as 684,079 inside, 201,002 outside, and 16 unreported indicators.

The 21 independently verified artifacts total 260,059,941 bytes. Record-level output remains `local-review-only`; the release explicitly sets `complete_all_businesses` to false.

## National goal evidence boundary

The retained layer is admitted under `tx-active-sales-tax-permit-outlet-evidence@1.0.0`, pinned to dataset release `tx-active-sales-tax-20260903-004825316Z-3ba279b8` and its manifest SHA-256. It is source-specific sales-tax taxpayer/outlet evidence, not the Texas Secretary of State entity master or all Texas businesses. Source `Active` does not establish continuous operation; outlets are not unique businesses or independently verified operating sites. The retained source has 885,278 rows, 885,097 normalized permitted outlets, 700,705 taxpayer organizations, 181 quarantined rows, and 2,156 source ZIP keys. In the cited coverage summary, 885,093 profiles are reported to Texas and four to CO, FL, LA, and VA; these address-state counts are distinct from source-wide outlet counts. No source geocodes are present, so no state-wide coordinate count is borrowed. Record-level output remains local-review-only and all-business/active-business completeness remains null.

## Official references

- [Texas Active Sales Tax Permit Holders](https://data.texas.gov/d/jrea-zgmq)
- [Texas Comptroller open-records guidance](https://comptroller.texas.gov/about/policies/open-records/)
- [Texas Comptroller privacy and security policy](https://comptroller.texas.gov/about/policies/privacy.php)
