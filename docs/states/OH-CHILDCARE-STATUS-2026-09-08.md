# Ohio childcare: initial status and coordinate acquisition specification

This follow-up supplements, rather than replaces, [the initial assessment](OH-CHILDCARE-ACCESS-2026-09-07.md). It changes the proposed acquisition scope, not production enrollment or published business counts. No facility records, object-ID lists, CSV files, accounts or access codes were requested in this follow-up.

## Status evidence and decision

At `2026-09-08T04:56:06.655Z`, the current [official map layer](https://maps.ohio.gov/arcgis/rest/services/Hosted/Ohio_Daycares_view/FeatureServer/0) returned the following aggregate for `program_type='Child Care Center'`:

| Publisher program_status | Source rows | Initial treatment |
| --- | ---: | --- |
| Open | 4,237 | Candidate publisher-open subset |
| Inactive | 102 | Excluded from initial open subset; retain status coverage gap |
| Enforcement | 5 | Excluded pending interpretation; **not** classified as closed or inactive |
| Total | 4,344 | Center-directory denominator, not active businesses |

The response reported `exceededTransferLimit=false`. The selected status field has no coded domain. Its observed vocabulary is not a legal status dictionary. An earlier independent exact Open count at `2026-09-08T04:50:44.665Z` returned 4,237; neither observation proves continuing operation, unique business identity, or future counts. The exact aggregate response and count bytes are retained in [the research evidence record](OH-CHILDCARE-STATUS-2026-09-08.json). These are research observations, not a connector's verified preflight receipt or a retained facility release.

Initial proposed filter:

```sql
program_type='Child Care Center' AND program_status='Open'
```

Call this cohort **publisher-open childcare center programs**. Do not name it verified active businesses. Report its source scope and observation time alongside totals. The excluded statuses remain explicit gaps; a future separately scoped status-history acquisition may retain them without admitting them to the initial open cohort. A later status change or disappearance must not silently erase an earlier observation or fabricate an effective closure date.

The denominator above is only this source's center directory. It is not all Ohio childcare, all Ohio businesses, or a national industry completeness denominator. The publisher item's SUTQ locator context does not prove comprehensive licensed-center coverage.

## Selected fields and point-only geography

Request exactly these ten attributes:

```text
objectid,county,program_type,program_number,program_name,street_address,city,state,zip_code,program_status
```

Request geometry separately with `returnGeometry=true`, `outSR=4326`, `returnZ=false`, `returnM=false`. Root rechecked metadata at `2026-09-08T04:56:06.558Z`: `sourceSpatialReference.wkid=3857` with WGS84 Web Mercator Auxiliary Sphere WKT; the distinct extent reference is `wkid=102100/latestWkid=3857`. The metadata response was 12,135 bytes, SHA-256 `45e73b54aeca041cfe9868be509f0d729391c5df83ce6888832da61187bd3e64`. Full metadata bytes are not retained by this research document.

This supersedes the initial proposal to select `geocode__latitude_` and `geocode__longitude_`: their attribute datum is unverified. Reject conflicting response/point CRS, partial pairs and non-point geometries. Preserve missing or implausible coordinates as explicit quality gaps. Valid points remain lat/lon on businesses, not polygons; governed county assignment must remain distinct from source county text. Do not convert projected coordinates directly into lat/lon.

Preserve nullable ZIP5 and ZIP4 separately and retain unusable-source-ZIP reasons without substituting a ZCTA or a coordinate-derived ZIP. Preserve `program_number` as a typed publisher identifier, not a license/NPI/NABP number. Validate Double values losslessly as positive safe integers before string conversion; do not reconstruct leading zeros. Preserve repeated identifiers for reconciliation rather than treating them as unique businesses. Mailing addresses, contacts, phone, email and unverified coordinate attributes remain excluded. Center classification alone does not prove a premises address is nonresidential.

## Access and metadata boundaries

The separately published [CSV export](https://childcaresearch.ohio.gov/export) requires a valid email and one-time access code, with five downloads per day and ten per calendar month per email. No email was submitted and no code or CSV was requested. A future CSV connector must honor that workflow. The app-linked map is an independently published source, not permission to bypass CSV controls, private endpoints or limits.

Parallel metadata-only research observed these XML failures on September 8 UTC:

- Owning-portal item `e7b80e83d8764427b5de7fde6f67f83d` XML: HTTP 404 at `04:49:24.948Z`, 921 response bytes, SHA-256 `b490bf42db6d999aac222c972b0325dc0da99c2853025c9e527883d91f62df17`.
- Layer `/metadata`: HTTP 400 at `04:49:37.753Z`, 715 response bytes, SHA-256 `e67e883eae308632d810cecef1544119934f2221b35da88953de5b862800e829`.

These are peer-observed failure summaries, not retained XML. `hasMetadata=true` does not establish accessible XML. A future preflight must retain complete available publisher notices and explicit unavailable-resource evidence; do not invent XML contents, follow authentication routes, or turn missing XML alone into an indefinite universal acquisition prohibition. Source-policy review still must evaluate the notices actually available. Public visibility alone is not acquisition or redistribution approval.

## Acceptance requirements before app handoff

1. Bind the fixed app-linked service/item identity and current full schema; retain available notices, metadata provenance and policy restrictions.
2. Check exact selected count and aggregate status conservation before/after acquisition; detect changes rather than hardcoding today's 4,237 as a timeless acceptance count.
3. Validate deterministic ID membership and bounded selected-field batches, including duplicate IDs, unexpected statuses, source drift, rate limits, response caps and cancellation.
4. Retain source-native selected rows, separate source observation/processing times, normalized rows and quarantine with exact conservation, ZIP/point gaps and immutable replay-verifiable releases.
5. Enroll the validated connector in Co*Tive with an actual operation ID and durable receipt. The app owns downloads and refreshes; agents move to other sources after accepted handoff. Retained releases are reused for promotion.

No Ohio live acquisition, source-policy authorization, scheduler enrollment, national integration or completeness increase is claimed by this specification. Production jobs and existing immutable releases are unchanged.
