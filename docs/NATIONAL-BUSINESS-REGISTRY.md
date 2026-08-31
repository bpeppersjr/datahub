# National business registry releases

The national business registry publisher converts governed source records into reusable canonical entities, field assertions, relationships, and ZIP coverage. Current releases combine the verified USDA SNAP current-retailer snapshot, CMS NPPES monthly organization-provider layer, FDIC BankFind active-institution/current-U.S.-location snapshot, NCUA final-quarterly federally insured credit-union layer, USDA FSIS active MPI establishment layer, EPA ECHO source-designated active regulated-facility layer, FMCSA active U.S. Company Census principal-office layer, IRS EO BMF current exempt-organization layer, Connecticut Secretary-of-the-State active Business Registry layer, Colorado Department-of-State Good Standing/Delinquent Business Entities layer, Oregon Secretary-of-State Active Businesses registration layer, Iowa Secretary-of-State Active Iowa Business Entities layer, New York Department-of-State Active Corporations layer, Florida Division-of-Corporations quarterly corporate layer, and Pennsylvania Department-of-State active-registration layer. It is an operational foundation, not a claim that every U.S. business has been collected.

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

Each Connecticut Business Registry source-system record whose source status is exactly `Active` produces one provisional organization. The source record ID, non-placeholder ALEI, registered and formation-jurisdiction names, status/sub-status, registration profile, NAICS values, reported business address, eligible ZIP/ZCTA, and source address geocode remain separate assertions. Reported addresses and geocodes are organization evidence only; they create no physical site, establishment, or relationship.

Connecticut `Active` is Secretary-of-the-State registration evidence, not independent proof of current operations, good standing, licensure, solvency, public access, or an open storefront. The connector excludes email, ownership-category survey responses, mailing/office/records addresses, agents, principals, organizers, and other person-linked data. Repeated placeholder ALEI `0000000` is not emitted as a unique identifier.

Each Colorado Business Entities source row whose source status is exactly `Good Standing` or `Delinquent` produces one provisional organization when its entity ID and registered name are valid. The entity ID, registered name, status, entity type, formation jurisdiction and date, principal-office address, and eligible ZIP/ZCTA remain separate assertions. Principal-office addresses are organization evidence only; they create no physical site, establishment, relationship, location profile, or geocode.

Colorado `Good Standing` means required periodic reports and required information are current in the registry. `Delinquent` means a filing, fee, report, registered-agent, or related registry obligation was not cured; Colorado law does not treat that status alone as termination of a domestic entity's existence. Neither value proves current operations, legality, reputation, solvency, licensure, public access, or an open storefront. Mailing addresses and every registered-agent name and address are excluded. A source row with valid identity number but no registered name remains in a governed quarantine instead of becoming an organization.

Each Oregon registry number in the selected principal-place snapshot produces one provisional organization for a legal-entity registration or one provisional brand for an `ASSUMED BUSINESS NAME`. Business name, registration number, type/date/jurisdiction, source-specific Active status, and every selected principal-place address remain separate assertions. Principal-place addresses create no physical site, establishment, relationship, or location profile, and an assumed name creates no inferred owner or legal organization.

Oregon `Active` is source-registration evidence, not independent proof of current operations, legality, licensure, solvency, public access, or an open storefront. Sole proprietors and general partnerships need not register unless using an assumed name. Associated-person, entity-of-record, mailing-address, registered-agent, authorized-representative, and source business-details fields are excluded.

Each Iowa source row with a unique valid six-digit corporation number produces one provisional organization. Legal name, corporation type, effective date, source-specific Active status, source-defined home-office address, eligible ZIP/ZCTA, optional source geocode, and external identifier remain separate assertions. Home-office addresses and coordinates create no physical site, establishment, owner, parent, relationship, or location profile.

Iowa `Active` is Secretary-of-State registration evidence, not independent proof of current operations, legality, licensure, solvency, public access, or an open storefront. Sole proprietorships, partnerships, and other structures not required to register may be absent. Every registered-agent name, address, ZIP, coordinate, and location field is excluded, along with the source home-office name and redundant location WKT.

Each New York source row with a unique valid DOS ID and current entity name produces one provisional organization. Legal name, entity type, jurisdiction, county, initial DOS filing date, source-specific monthly active-extract membership, reported location address, eligible ZIP/ZCTA, and external identifier remain separate assertions. OPEN-NY policy is preserved as `public-open-ny-terms` on every New York assertion. Reported locations create no physical site, establishment, owner, parent, relationship, or location profile.

New York extract membership is intended for general public knowledge and is not legal documentation or proof of current legal status, current operations, legality, solvency, licensure, public access, or an open storefront. Inactive and temporarily suspended entities plus assumed names are excluded. Reported locations are collected through biennial statements and may be absent, incomplete, stale, administrative, residential, virtual, out-of-state, or foreign. DOS process/service-of-process, CEO or chairman, registered-agent, and location-name fields are excluded before acquisition.

Each Florida quarterly corporate row coded exactly `A` with a unique valid Division-of-Corporations document number and corporate name produces one provisional organization. Legal name, filing type, file and transaction dates, jurisdiction, recent annual-report dates, source-specific active code, principal address, eligible ZIP/ZCTA, and document number remain separate assertions. Principal addresses create no physical site, establishment, owner, parent, relationship, or location profile.

The official archive contains both `A` and `I` rows despite the overview's active-data wording. The governed source layer counts all 12,808,196 rows, excludes 8,698,964 inactive rows, publishes 4,109,230 active organizations, and quarantines two malformed active records. Florida source Active status is registration evidence—not proof of current operation, legality, solvency, licensure, public access, deliverability, or an open storefront. Mailing addresses, FEI values, registered agents, officers, and other person-linked fields are excluded before normalization. The source is provided as-is and can change, be replaced, or be removed.

Each distinct Pennsylvania filing number in the official active-registration view produces one provisional organization. Legal name, filing number, registration type, reported business address, eligible ZIP/ZIP+4 and ZCTA, source county label, and optional portal geocode remain separate assertions. Reported addresses and portal geocodes create no physical site, establishment, owner, parent, relationship, or location profile.

Pennsylvania warns that statutory limitations on removing businesses no longer in operation make this source larger than the currently operating business population. The release therefore preserves active-registration membership only; it does not assert current operations, good standing, licensure, solvency, public access, or an open storefront. Officer/person fields are excluded at query time. One duplicated filing number is deterministically collapsed while both source rows remain counted and checksummed, and implausible portal geocodes remain flagged rather than silently corrected.

## ZIP coverage

`derived/zip-coverage.jsonl` preserves every ZIP in the Census ZBP/ZCTA plus contributing-source union. Each row reports canonical sites, establishments, organization primary locations, IRS EO organization filing addresses, Connecticut active-registration reported business addresses, Colorado Good Standing/Delinquent principal-office addresses, Oregon legal-entity and assumed-name principal-place addresses, Iowa active-entity home-office addresses, New York active-extract reported locations, Florida active-corporate principal addresses, Pennsylvania active-registration reported business addresses, SNAP evidence, NPPES primary/non-primary practice locations, FDIC current locations, NCUA reported U.S. locations, FSIS active MPI establishments, EPA ECHO active regulated facilities, FMCSA active-registration principal offices, source releases and freshness, Census employer baseline data, ZCTA geometry status, and current-USPS evidence when a governed USPS release is supplied. IRS and state-registry address contributions change record-level coverage status but never increment physical-site or establishment counts.

Rows with no record-level contribution from any integrated source are retained as `denominator-only-no-record-level-contribution`. Every row sets `complete_all_businesses` to `false`. The manifest also leaves `authoritative_current_usps_zip_denominator` as `null`; percentages over “all valid U.S. ZIPs” remain prohibited until that denominator is acquired from an authorized source.

The optional `--usps-zips` prerequisite accepts the governed `usps-operational-zip-assignments` release. When present, the ZIP union adds USPS-only denominator rows, the manifest records a scoped Area/District assignment denominator object, and every ZIP receives either `listed-in-current-usps-area-district-file` or `not-listed-in-current-usps-area-district-file`. Neither status asserts address-level deliverability. The ZIP artifact inherits `local-restricted` or `permission-governed` distribution policy from the USPS release; other business artifacts retain their own source policies.

## Artifact contract

- `entities/physical-sites/prefix=<0-9>.jsonl.gz`
- `entities/establishments/prefix=<0-9>.jsonl.gz`
- `entities/organizations/npi-prefix=<0-9>.jsonl.gz`
- `entities/organizations/fdic-cert-prefix=<0-9>.jsonl.gz`
- `entities/organizations/ncua-charter-prefix=<0-9>.jsonl.gz`
- `entities/organizations/irs-ein-prefix=<0-9>.jsonl.gz`
- `entities/organizations/ct-record-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/co-record-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/or-registry-hash-prefix=<0-f>.jsonl.gz`
- `entities/brands/or-registry-hash-prefix=<0-f>.jsonl.gz`
- `assertions/registrations/or-registry-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/ia-corp-hash-prefix=<0-f>.jsonl.gz`
- `assertions/organizations/ia-corp-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/ny-dos-hash-prefix=<0-f>.jsonl.gz`
- `assertions/organizations/ny-dos-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/fl-document-hash-prefix=<0-f>.jsonl.gz`
- `assertions/organizations/fl-document-hash-prefix=<0-f>.jsonl.gz`
- `entities/organizations/pa-filing-hash-prefix=<0-f>.jsonl.gz`
- `assertions/organizations/pa-filing-hash-prefix=<0-f>.jsonl.gz`
- `entities/services.jsonl`
- `assertions/prefix=<0-9>.jsonl.gz`
- `relationships/prefix=<0-9>.jsonl.gz`
- `resolution/location-profiles/zip2=<00-99>.jsonl.gz`
- `derived/zip-coverage.jsonl`
- `derived/source-contributions.json`
- `manifest.json`

The verifier hashes every artifact, parses every record, checks unique IDs and relationship endpoints, requires assertion provenance and export policy, and reconciles ZIP and manifest counts. For compatible publishers 1.2.0 through 1.9.0 it also requires exactly 100 ZIP2 match-profile partitions, validates their links back to provisional entities and their provenance hashes, and requires exactly one profile per provisional physical site. Its exact partitioned identity index keeps verification bounded for tens of millions of numeric source IDs without weakening duplicate detection. It rejects excluded Connecticut, Colorado, Oregon, Iowa, New York, Florida, or Pennsylvania fields, any site/relationship inference from those registry addresses, loss of governed source policies, unsupported business-completeness claims, and any USPS denominator without a checksummed governed dependency, exact scoped semantics, conservative deliverability flags, and inherited distribution policy.

Match profiles feed the separate [`national-business-entity-resolution`](BUSINESS-ENTITY-RESOLUTION.md) dataset. That layer can publish reversible aliases and review candidates without changing this registry release, its source assertions, or its current pointer.

## Validated live release

The independently verified publisher-1.9 release `national-business-registry-20260831-155144265Z-ba303284` contains 31,901,383 governed source rows. It publishes 18,073,874 organizations, 116,332 brands, 6,161,280 provisional physical sites, 6,161,280 provisional establishments, one service, 171,247,257 assertions, 8,601,934 relationships, and exactly 6,161,280 location match profiles across 463 verified artifacts totaling 10,228,353,639 bytes.

Its 48,118-row ZIP union has record-level source contributions in 47,903 rows. Pennsylvania adds 2,347,229 organizations and 2,088,998 eligible reported-business-address contributions from 4,537 source ZIPs; one duplicate filing-number row is collapsed and 2,320 Pennsylvania-address portal geocodes outside broad state bounds remain flagged. Florida adds 4,109,230 organizations and 3,928,280 eligible reported-principal-address contributions across 19,064 source-reported ZIP values; two malformed active rows remain quarantined and 8,698,964 inactive rows are explicitly excluded. New York adds 4,275,497 organizations and 352,234 eligible reported-location/ZIP contributions across 8,653 source ZIPs. Iowa adds 347,200 organizations, 334,176 eligible home-office/ZIP contributions, and 330,664 source-geocoded organization assertions across 9,901 source ZIPs. Oregon adds 443,158 legal-entity registrations as organizations and 116,332 assumed-name registrations as brands, with 559,141 eligible registration/ZIP contributions across 9,177 source ZIPs. All seven state-registry address layers create no physical sites, establishments, relationships, or location profiles. The release remains explicitly `published-partial`, and `authoritative_current_usps_zip_denominator` remains `null`; a source-reported five-digit value is not represented as a current USPS assignment.

This 1.9 release supersedes the verified 1.8 registry. Its 100 source-preserving ZIP2 match-profile artifacts and all 6,161,280 physical-site/profile records are unchanged in cardinality; only governed organization/assertion/ZIP evidence and dependency lineage expand. The USPS connector and optional registry integration are implemented, but this current release still omits USPS evidence until an operator truthfully selects an authorized use basis and publishes a local governed USPS source release.

## Adding the next source

Add a source adapter that emits the same entity/assertion/relationship contracts while retaining the source release, record, ingest run, transformation, policy, observation time, and export classification. Cross-source merging requires a separate versioned rule with reversible evidence; new adapters must not silently overwrite existing assertions.
