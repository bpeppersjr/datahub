# National business registry releases

The national business registry publisher converts governed source records into reusable canonical entities, field assertions, relationships, and ZIP coverage. Current releases combine the verified USDA SNAP current-retailer snapshot, CMS NPPES monthly organization-provider layer, FDIC BankFind active-institution/current-U.S.-location snapshot, NCUA final-quarterly federally insured credit-union layer, USDA FSIS active MPI establishment layer, EPA ECHO source-designated active regulated-facility layer, FMCSA active U.S. Company Census principal-office layer, and IRS EO BMF current exempt-organization layer. It is an operational foundation, not a claim that every U.S. business has been collected.

## Build and verify

The default command consumes each integrated source's governed `current.json` pointer and keeps all artifacts under `datahub/data/business-registry`:

```powershell
npm run registry:build
npm run registry:verify
```

The publisher validates the checksums of every consumed source partition and the source ZIP coverage artifact before reconciliation. It streams immutable gzip JSON Lines partitions, publishes the manifest last, and atomically updates `current.json`. Failed or cancelled runs cannot replace the current release.

## Current identity rules

Each USDA source record produces:

- one provisional `physical_site` entity;
- one provisional `establishment` entity;
- one `located_at` relationship from the establishment to the site;
- one `provides_service` relationship to the resolved SNAP-authorization service entity;
- source-backed address, point, ZIP/ZCTA, name, external identifier, store type, SNAP authorization, program, and source-specific status assertions when present.

The publisher deliberately does not infer a brand, owner, parent company, legal organization, general operating status, or cross-record match from a store name. The source status remains `snap-authorized-as-of-source-update`, whose scope explicitly says it is not a general operating-status guarantee.

Each active or reactivated CMS Entity Type 2 NPI produces one provisional organization. Each reported U.S. primary or non-primary practice location produces a provisional physical site and establishment, with `operates` and `located_at` relationships. NPI status, names, taxonomies, address, telephone, and source-specific location status remain separate provenanced assertions. A reported parent-organization name stays text; no ownership relationship is inferred without a resolvable identifier.

Active individual NPIs and authorized-official personal fields are excluded. NPI enumeration never becomes a licensure, credentialing, or “open now” claim.

Each active FDIC certificate produces one provisional organization. Each current indexed U.S. location unique number produces one provisional physical site and establishment, with `operates` and `located_at` relationships. Institution identifiers, class, status, reported headquarters, office count and dates remain assertions; location address, coordinates, main-office flag, service type and source-specific status remain separate assertions. The publisher excludes FDIC foreign offices and does not merge an FDIC institution with an NPPES or SNAP entity merely because names or addresses resemble each other.

An FDIC current-location record is not an independent claim that an office is open to the public, has current hours, or offers every reported service today.

Each accepted NCUA charter produces one provisional organization. Each valid reported U.S. branch row produces a provisional physical site and establishment, with `operates` and `located_at` relationships. Credit-union type, charter and join numbers, RSSD, mailing address, trade names, main-office flag, location type, phone, hours, and member-service/ATM/drive-through/shared-network flags remain separate assertions. NCUA reuses `SiteId` across institutions, so identities use charter plus `SiteId`; the publisher does not assume shared ownership or merge those sites automatically.

An NCUA final-quarterly record is not independent proof of current public access, membership eligibility, current hours, or service availability. Non-federally-insured and foreign source records remain counted exclusions.

Each accepted FSIS establishment ID produces one provisional physical site and establishment with a `located_at` relationship. Establishment numbers, names, DBAs, address, point, phone, county/FIPS, grant date, activities, inspection context, active grant classes, and published demographic flags/categories remain separate assertions. The publisher does not infer a legal organization, parent company, owner, or cross-source match from the establishment name or DBA. The source DUNS field is excluded from normalized and registry records.

FSIS active-directory membership is source-specific regulatory evidence. It is not independent proof of general business operating status, public access, current hours, ownership, or every product made.

Each accepted EPA ECHO FRS `REGISTRY_ID` produces one provisional physical site and establishment with a `located_at` relationship. Facility name, address, reported/derived geography, coordinates and precision metadata, NAICS/SIC classifications, environmental-program associations and identifiers, facility context, and source-specific status remain separate assertions. The publisher does not infer a legal organization, owner, parent company, or cross-source match from `FAC_NAME`.

ECHO `FAC_ACTIVE_FLAG=Y` means at least one associated ICIS-Air, ICIS-NPDES, RCRAInfo, or SDWIS permit/facility is active. It is not independent proof of general business operation, public access, ownership, or active status in every associated program. ECHO contains businesses, public agencies, utilities, institutions, and other regulated sites; it is not a business census. Coordinates marked as ZIP or county centroids retain an explicit precision warning.

Each accepted FMCSA USDOT record produces one provisional physical site and establishment with a `located_at` relationship. The publisher keeps USDOT/docket identifiers, legal and DBA names, reported principal-office address and ZIP/ZCTA, source classifications, registration dates, source-specific active status, and data-sensitivity warnings as separate assertions. It creates no legal organization, proprietor entity, parent, ownership relationship, or cross-source match.

The FMCSA business-organization type is review-only and incomplete, and a registered entity can be an individual proprietor. A principal office can be home-based and is not independently verified as a storefront, customer-accessible location, vehicle base, or currently deliverable address. Officer, phone, cell, fax, email, D&B, mailing-address, crash, review, inspection, safety-rating, and unnecessary operational fields are excluded before acquisition.

Each accepted IRS EO BMF EIN produces one provisional organization. Legal and secondary names, EIN, filing address and ZIP/ZCTA, tax-exempt profile, and source-specific current-extract status remain separate assertions. Filing addresses can be mailing addresses or P.O. boxes, so the publisher creates no physical site, establishment, or relationship from an IRS row. Group and affiliation codes do not create parent, chapter, ownership, or control relationships.

Current EO BMF membership and exempt-status codes are federal tax-status evidence, not independent proof of current operation, public access, or a current physical location. The source `ICO` in-care-of personal-contact field and financial amounts are excluded from normalized and registry records.

## ZIP coverage

`derived/zip-coverage.jsonl` preserves every ZIP in the Census ZBP/ZCTA plus contributing-source union. Each row reports canonical sites, establishments, organization primary locations, IRS EO organization filing addresses, SNAP evidence, NPPES primary/non-primary practice locations, FDIC current locations, NCUA reported U.S. locations, FSIS active MPI establishments, EPA ECHO active regulated facilities, FMCSA active-registration principal offices, source releases and freshness, Census employer baseline data, ZCTA geometry status, and current-USPS evidence when a governed USPS release is supplied. An IRS filing-address contribution changes record-level coverage status but never increments physical-site or establishment counts.

Rows with no record-level contribution from any integrated source are retained as `denominator-only-no-record-level-contribution`. Every row sets `complete_all_businesses` to `false`. The manifest also leaves `authoritative_current_usps_zip_denominator` as `null`; percentages over “all valid U.S. ZIPs” remain prohibited until that denominator is acquired from an authorized source.

The optional `--usps-zips` prerequisite accepts the governed `usps-operational-zip-assignments` release. When present, the ZIP union adds USPS-only denominator rows, the manifest records a scoped Area/District assignment denominator object, and every ZIP receives either `listed-in-current-usps-area-district-file` or `not-listed-in-current-usps-area-district-file`. Neither status asserts address-level deliverability. The ZIP artifact inherits `local-restricted` or `permission-governed` distribution policy from the USPS release; other business artifacts retain their own source policies.

## Artifact contract

- `entities/physical-sites/prefix=<0-9>.jsonl.gz`
- `entities/establishments/prefix=<0-9>.jsonl.gz`
- `entities/organizations/npi-prefix=<0-9>.jsonl.gz`
- `entities/organizations/fdic-cert-prefix=<0-9>.jsonl.gz`
- `entities/organizations/ncua-charter-prefix=<0-9>.jsonl.gz`
- `entities/organizations/irs-ein-prefix=<0-9>.jsonl.gz`
- `entities/services.jsonl`
- `assertions/prefix=<0-9>.jsonl.gz`
- `relationships/prefix=<0-9>.jsonl.gz`
- `resolution/location-profiles/zip2=<00-99>.jsonl.gz`
- `derived/zip-coverage.jsonl`
- `derived/source-contributions.json`
- `manifest.json`

The verifier hashes every artifact, parses every record, checks unique IDs and relationship endpoints, requires assertion provenance and export policy, and reconciles ZIP and manifest counts. For publisher 1.2.0 it also requires exactly 100 ZIP2 match-profile partitions, validates their links back to provisional entities and their provenance hashes, and requires exactly one profile per provisional physical site. It rejects unsupported business-completeness claims and rejects any USPS denominator without a checksummed governed dependency, exact scoped semantics, conservative deliverability flags, and inherited distribution policy.

Match profiles feed the separate [`national-business-entity-resolution`](BUSINESS-ENTITY-RESOLUTION.md) dataset. That layer can publish reversible aliases and review candidates without changing this registry release, its source assertions, or its current pointer.

## Validated live release

The independently verified publisher-1.2 release `national-business-registry-20260830-201530698Z-7230b6a4` contains 8,936,163 governed source records, including 2,195,563 accepted FMCSA active principal-office records and 1,955,841 current IRS EO BMF organizations. It publishes 3,923,962 organizations, 6,161,280 provisional physical sites, 6,161,280 provisional establishments, one service, 77,115,239 assertions, 8,601,934 relationships, and exactly 6,161,280 location match profiles across 223 verified artifacts.

Its 43,586-row ZIP union has record-level source contributions in 43,310 ZIPs. FMCSA added one site, one establishment, and one `located_at` relationship per accepted USDOT principal-office record, but no inferred organization or parent. The source and registry transformations deduplicate repeated typed docket identifiers while preserving source slot observations; the rejected intermediate registry release remains immutable and is not current. The verified release remains explicitly `published-partial`, and `authoritative_current_usps_zip_denominator` remains `null`.

This 1.2 release supersedes the prior verified 1.1 registry while preserving its source-derived entity, assertion, relationship, and ZIP counts; the additional 100 artifacts are source-preserving ZIP2 match profiles. The USPS connector and optional registry integration are implemented, but this current release still omits USPS evidence until an operator truthfully selects an authorized use basis and publishes a local governed USPS source release.

## Adding the next source

Add a source adapter that emits the same entity/assertion/relationship contracts while retaining the source release, record, ingest run, transformation, policy, observation time, and export classification. Cross-source merging requires a separate versioned rule with reversible evidence; new adapters must not silently overwrite existing assertions.
