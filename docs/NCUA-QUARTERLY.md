# NCUA final quarterly credit-union source

This connector adds federally insured credit unions and their reported U.S. corporate and branch offices as a governed national source layer.

Official sources:

- [NCUA Credit Union and Corporate Call Report Data](https://ncua.gov/analysis/credit-union-corporate-call-report-data)
- [NCUA Call Report Quarterly Data](https://ncua.gov/analysis/credit-union-corporate-call-report-data/quarterly-data)

NCUA describes the posted quarterly ZIP files as final data and supplies comma-delimited tables for `FOICU`, credit-union branches, trade names, ATMs, and Call Report accounts. This connector downloads the public final ZIP and does not use the CUOnline data web service, whose access and behavior are governed separately.

## Build and verify

```powershell
npm run ncua:build
npm run ncua:verify
```

Discovery selects the newest official `call-report-data-YYYY-MM.zip` anchor from the NCUA quarterly page. The exact archive, SHA-256, cycle date, HTTP metadata, required entry schemas, and source-table counts are pinned before normalization. Any missing entry, changed header, mixed cycle, count floor failure, or excessive quarantine rate blocks publication.

Raw source data remains in the immutable checksummed ZIP. Because `FOICU.ATTENTION_OF` may contain a business-contact name, the archive is internal source material and that field is not normalized or published. Normalized institutions and trade names are partitioned by charter prefix; U.S. locations are partitioned by ZIP prefix. The manifest and `current.json` pointer publish last and atomically.

## Scope and identity

The organization layer includes `CU_TYPE` 1 and 2 records: federally chartered/federally insured and state chartered/federally insured credit unions. Other source types are counted and excluded.

Each charter number produces one provisional organization. Each valid U.S. branch row produces a provisional physical site and establishment. NCUA `SiteId` is not globally unique: thousands of site IDs appear under multiple credit unions, often through shared-service arrangements. Entity candidates therefore use the composite charter number plus `SiteId`; no shared physical-site or ownership inference is made.

Trade names remain separate organization-name assertions. Charter number, NCUA join number, source-scoped site ID, and Federal Reserve RSSD remain typed external identifiers.

## Status and services

Institution status means the record was a federally insured source type in the pinned final quarterly release. Location status means the U.S. branch row joined to such an institution in that same release. Neither is an independent guarantee of current public access, membership eligibility, current hours, or service availability.

Reported phone, hours, main-office flag, office type, member-service, ATM, drive-through, and shared-service-network fields remain separate source assertions when reconciled.

## ZIP coverage

`derived/zip-coverage.jsonl` preserves the Census ZBP/ZCTA union and adds any accepted five-digit ZIP from an NCUA U.S. branch. Counts distinguish main offices, branch offices, reported ATMs, and reported drive-through service. ZIPs with no NCUA record remain visible as source-specific gaps; absence does not mean no business. Current USPS validity remains unverified pending an authoritative denominator.
