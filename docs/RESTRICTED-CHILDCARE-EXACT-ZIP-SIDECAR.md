# Restricted childcare exact-ZIP sidecar

This internal read model exposes the two already-retained query samples by their source-reported ZIP5 without adding either sample to the national exact-ZIP industry matrix, measured-zero states, state or national completeness denominators, generic business totals, or production enrollment.

The registered inputs are the successful retained-childcare snapshot operation and its immutable v2 manifest. The sidecar performs no network requests, submits no operation, changes no source timestamp and writes no pointer. A read rehashes the enrolled snapshot but does not replay the source sites.

## Supported evidence

- New Hampshire ZIP `03755`: six retained Licensed Group Child Care Program rows, all reporting ZIP5 `03755`, with separate null ZIP+4 and no source coordinates.
- Oklahoma ZIP `73102`: four retained center-query rows, all reporting ZIP5 `73102`, with separate null ZIP+4 and four source coordinate pairs. Datum, accuracy and association with the reported address or premises remain unverified.

Names, source record IDs, source address lines, query ZIP, reported ZIP5, separate ZIP+4, observation time, normalization time, source policy, source URLs and upstream receipt/manifest hashes remain visible. First/last seen are the single retained observation, not proof of continuous operation or publisher update time.

For every other ZIP, the response is `absent-from-restricted-samples`. That means only that neither bounded sample contains a retained row reporting the requested ZIP. It is not measured zero, does not establish USPS validity and does not imply zero childcare businesses.

The authenticated loopback endpoint is `GET /api/business-map/restricted-childcare-exact-zip-sidecar?zip=NNNNN`. Existing Business Intelligence sample rendering remains the operator UI: it already labels these rows as restricted samples, filters on reported ZIP rather than assigning the query ZIP, and keeps them separate from map shading and national totals.

Rollback removes the registration, reader, endpoint and documentation while preserving the retained snapshot, source observations and all production pointers.
