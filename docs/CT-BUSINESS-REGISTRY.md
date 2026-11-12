# Connecticut Business Registry active organizations

This source layer publishes a governed snapshot of records whose `Status` is exactly `Active` in the official Connecticut Business Registry - Business Master dataset (`n7gp-d28j`). It is the reusable state-registry template for the national business-coverage program.

## Authority and meaning

The Connecticut Secretary of the State, Business Services Division maintains the source. The official catalog marks it Public Domain. The state's registry documentation says `Active` means active in Secretary-of-the-State records. Co*Tive Collector therefore records a source-specific registration fact. It does not translate that fact into proof of current operations, good standing, licensure, solvency, public access, or an open storefront.

The source includes domestic and foreign-registered entities. Its `Business_*` address is preserved as a reported organization address. It may be an administrative, home, virtual, mailing-like, incomplete, stale, out-of-state, or foreign address. Even when the source supplies a point, the connector creates no physical site or establishment.

## Governed acquisition

The connector:

1. retrieves official catalog metadata and requires the expected dataset ID, title, attribution, Public Domain license, and pinned selected-field schema;
2. preflights the exact `Status='Active'` count;
3. requests only 25 approved fields using strictly increasing source-ID keyset pagination;
4. rejects redirects, non-allowlisted hosts and paths, oversized pages, out-of-order IDs, non-active rows, schema drift, and duplicate source identity;
5. rechecks the catalog refresh timestamp and active count after acquisition and aborts publication if the source changed;
6. hashes the complete selected-field source snapshot before normalization;
7. writes run-scoped immutable artifacts and changes `current.json` only after all quality gates pass.

The current source release identity is bound to the catalog `rowsUpdatedAt` timestamp and the SHA-256 checksum of the complete ordered source artifact.

## Recurring source review

The official Connecticut catalog, open-data terms, and anonymous API transport were reviewed again on 2026-11-12. The catalog identifies the Business Master as a Public Domain, daily-updated Secretary-of-the-State dataset. Connecticut's open-data guidance describes open data as freely reusable and redistributable without legal or financial restrictions. The portal terms provide the data as-is, disclaim warranties and liability, and reserve the right to discontinue availability; Co*Tive displays that limitation and fails closed on transport, schema, count, or timestamp drift.

A zero-record transport preflight returned HTTP 200 for the official metadata endpoint and HTTP 200 for an aggregate `Status='Active'` count query. The metadata response reported dataset `n7gp-d28j`, the expected title, a Public Domain license, and `rowsUpdatedAt=1794480283`; its 113,751 response bytes hashed to `b7baa9c45e56a51fd56093515e306cb744bf3506a5c8f143dd356e66b2115a9a`. The aggregate response contained only `count=461875`; its 21 bytes hashed to `c6347bd75bf87ee785e3f3702f1ecc5e4045db8d47ff4e9d800dcc0924e386e8`. No business rows were requested or retained by this review.

Authorization `ct-business-registry-production-20261112-01` permits Co*Tive—not Codex—to run the full-snapshot refresh, independently verify the new immutable release, and change only this source's production pointer after verification. It is cryptographically bound to the exact builder, verifier, connector, policy, and dataset configuration. Any byte change invalidates dispatch. The authorization does not promote source `Active` to verified operation, physical-site evidence, or an all-business denominator.

Reviewed official sources:

- <https://data.ct.gov/Business/Connecticut-Business-Registry-Business-Master/n7gp-d28j>
- <https://data.ct.gov/stories/s/CT-Business-Registrations/dagr-u2hb/>
- <https://data.ct.gov/terms>
- <https://portal.ct.gov/-/media/CT-Data/Data-Publication-Guidelines-V1.pdf>

## Field boundary

Approved normalized fields include the source record ID, non-placeholder Authoritative Legal Entity Identifier (ALEI), registered name and formation-jurisdiction name, business type, status and sub-status, registration and reporting dates, formation fields, NAICS values, the reported business address, and the source address geocode.

The connector deliberately excludes:

- business and survey email addresses;
- ownership-category survey responses;
- mailing, office-jurisdiction, and records addresses pending separate purpose review;
- agents, principals, organizers, and other people or person-linked subsidiary datasets.

The source has a repeated placeholder ALEI of `0000000`; it is never emitted as a unique external identifier. The source system record ID is the provisional organization identity.

## Coverage and gaps

Every active source row becomes an organization candidate. A row contributes to ZIP coverage only when it has a street, city, supported U.S. state or territory code, a valid ZIP5 or ZIP+4, and no explicitly non-U.S. country value. ZIP allocation is an organization-address observation, not a site count.

The release records separately:

- active organizations published;
- eligible reported U.S. business addresses;
- organizations without an eligible U.S. ZIP address;
- source-geocoded addresses;
- source sub-statuses, including overdue reports and dissolution/forfeiture initiation;
- active rows that nevertheless contain a dissolution or withdrawal date;
- placeholder ALEI records;
- every ZIP in the governed Census ZBP/ZCTA union, including zero-contribution ZIPs.

Current USPS operational validity remains `unverified` until an authorized USPS denominator is integrated.

## Current verified release

Release `ct-business-registry-20260903-003855102Z-e8cabffc` is bound to source refresh `2026-09-02T09:25:09.000Z` and source release `ct-business-registry-2026-09-02-30857c9921e9e791`. Independent verification rehashed and parsed all 20 artifacts totaling 140,917,813 bytes.

The release publishes all 458,892 source-active organizations. Exactly 448,166 have an eligible reported U.S. business address across 9,230 source ZIPs; 10,726 remain organization-only records without an eligible ZIP allocation. The source includes 47,644 geocoded reported addresses, 13 repeated placeholder-ALEI records, and 1,360 active rows that also report a dissolution or withdrawal date. Those facts are preserved explicitly. Physical-site and establishment counts remain `null` because neither is inferred.

## Operations

Build and independently verify the release:

```powershell
npm run ct-business:build
npm run ct-business:verify
```

If Windows temporarily holds a staging-directory handle after every artifact and the manifest have been completed, the same immutable run can be independently verified and published without reacquiring the source:

```powershell
npm run ct-business:build -- --resume-staging-run <run-uuid>
```

Outputs remain under `data/business-sources/ct-business-registry-active-organizations`. Raw selected-field source snapshots are internal; approved normalized records are public with attribution, provenance, refresh timestamp, and the semantic limitations above.
