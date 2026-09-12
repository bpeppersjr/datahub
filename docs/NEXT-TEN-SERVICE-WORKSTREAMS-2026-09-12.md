# Next ten service workstreams

Root reconciliation of the independent feed audit against main `9f07397`. This is a rolling development queue, not ten active agents, downloads, or completed feeds. The main acceptance build is frozen; implementation continues in isolated service checkouts.

| Priority | Reach / industry | Next deliverable | Boundary |
| --- | --- | --- | --- |
| 1 | Nationwide hospitals | Versioned reporting-catalog admission and production projection integration | Typed coverage code is integrated; production release and catalog expansion are not. Reuse 5,419 retained directory rows. |
| 2 | Nationwide nursing facilities | Production input pins, then separate coverage projection | Typed registry admission is integrated. Reuse 14,690 recovered rows; preserve original failed acquisition and zero verified facility points. |
| 3 | Nationwide nonemployer industries | Explicit NAICS 2022 selection and consumer contract | Separate annual nonemployer counts from employer establishments, business identities and collection completeness. No implicit category crosswalk or overlapping hierarchy sums. |
| 4 | Nationwide / PR address geocoding | Native wire-schema prerequisite, followed by bounded app lifecycle | Offline parser is a candidate contract, not evidence of native response variants. Do not upload the hospital cohort to discover transport semantics. |
| 5 | UT childcare | Explicit future-edition selection and validation | Existing 422-row retained adoption is implemented; do not rebuild it or repull for promotion. |
| 6 | IA childcare geography | Publisher CRS evidence and appropriate county-assignment contract | Retained 1,476-row input exists; unknown datum remains unavailable, not guessed. |
| 7 | ME ambulatory surgery | Approved native metadata-preflight evidence before selected collector | Managed preflight exists; its held native session is not silently authorized by this queue. |
| 8 | NE childcare | Narrow PDF edition/schema prerequisite | Respect existing internal-use scope; do not publish home/contact fields. |
| 9 | KS retail food | Accessible official current-license roster contract | Endpoint, subtype/status and scope remain unresolved. Food-license counts are not grocery-store counts. |
| 10 | NH childcare | Permitted broader query scope and pagination/conservation contract | Six retained sample rows are not statewide completeness; existing restricted scope remains intact. |

PA/MD county display, the six retained state adapters, UT current adoption, and ECHO/FSIS eight-source reporting are already implemented. Reopen only an evidenced gap. Overture's separate large-acquisition decision and Oklahoma's failed request are not automatic retries in this queue.

## Address-geocoding prerequisite handoff

The [official API documentation](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), read again on September 12, documents batch submission and a public Census headquarters example. It does not, in the reviewed HTML, prove every status-specific CSV output arity. Documentation search did not resolve that native-wire gap; do not promote synthetic tests to service evidence.

The next coding slice should implement a small standalone prerequisite using only a fixed publicly documented demonstration address, not a CMS record or user address. Persist a run ID, explicit public benchmark catalog selection, bounded request intent, submitted demonstration bytes and received bytes/hash/status/timestamps. Limit to one small POST, no redirects or retries, one shared provider lease, conservative request/response/deadline bounds, and explicit uncertain-submission handling. Validate the returned opaque ID and preserve the raw CSV before deciding whether its observed status fits the candidate parser. A single matched example proves only that observed variant; it cannot certify Tie/No_Match or Puerto Rico response variants.

This document is an implementation handoff, not an executed submission. Once built and tested, that public demonstration can establish actual transport evidence without exposing the retained hospital cohort. Broader source-specific address disclosure, provider-retention uncertainty, immutable mapping, and full row reconciliation belong in the subsequent native lifecycle. No additional user credential is assumed necessary.
