# Kentucky childcare discovery — September 8, 2026

## Outcome: official public search discovered; bulk/API contract not validated

The scoped repository search found no prior Kentucky childcare assessment. This investigation inspected official documentation and public search-page metadata only. No provider search was submitted; no facility records, ID rosters, counts, CSV exports or bulk datasets were requested. No account, fee, cookie acceptance, agreement, contact request or access workaround was used.

The [CHFS Division of Child Care](https://www.chfs.ky.gov/agencies/dcbs/dcc/pages/default.aspx) lists a public provider-search resource. The [CHFS inspection guidance](https://www.chfs.ky.gov/agencies/dcbs/dcc/Pages/abuseinjurydataandinspection.aspx) identifies kynect as the place to search by address, provider name or license and view inspection details. The identified delivery surface is the [Kentucky Child Care Provider Search](https://kynect.ky.gov/benefits/s/child-care-provider?language=en_US), not a verified bulk/API endpoint.

The [official kynect provider-search FAQ](https://www.chfs.ky.gov/agencies/dms/kynect/kbFAQChildCareSearch.pdf) is a four-page public document. It explains resident searches by location, ZIP, name or license; route searches have a 15-mile radius. It documents displayed provider type/status, county, capacity, CCAP, accreditation, hours and inspections. These are user-interface semantics, not validated database field names, status codes, pagination or completeness guarantees. No name/address/ZIP/point schema or update cadence was established. A map and route-search feature do not establish the coordinates' datum or allow a complete statewide enumeration to be inferred.

## Important center-versus-home boundary

The [current published 922 KAR 2:090 text](https://apps.legislature.ky.gov/law/kar/titles/922/002/090/15323/) distinguishes Type I and Type II child-care centers. Type I serves at least four children in a nonresidential setting, or at least thirteen in designated space separate from the licensee's primary residence. Type II is the licensee's primary residence and serves seven to twelve children. Thus, a generic label containing “center” is insufficient to exclude home-based providers. Initial center-based collection should investigate the exact source representation of **Type I**, without assuming that a display label is a verified query predicate. Type II and certified family childcare homes should remain outside this initial privacy scope.

The [CHFS All STARS provider page](https://www.chfs.ky.gov/agencies/dcbs/dcc/Pages/kyallstarsproviders.aspx) covers Type I, Type II and certified family homes and describes preliminary-license participation. Quality-rating membership must not be used as a current-operation or full-license status filter.

## Access observations and notices

The browser retrieval of the kynect search URL returned a loading/CSS-error shell. A search-index representation displayed search controls and a Privacy Policy & Terms of Use/cookie notice, but the actual policy target and complete terms were not established. No consent was clicked and no refresh or alternate transport was attempted. This is a rendering/access-observation limitation, not evidence that public search requires payment or accounts, or that internal collection is prohibited.

The CHFS division page and an [Energy and Environment Cabinet compliance page](https://eec.ky.gov/Environmental-Protection/Water/Drinking/DWProfessionals/Pages/Compliance.aspx) initially rendered; subsequent targeted text retrieval returned browser-tool timeout errors. They were not retried after those failures. The compliance search result mentioned a childcare-provider listing, but its target was not resolved, so it is only a discovery lead.

An official-hosted [Institutions MapServer](https://watermaps.ky.gov/arcgis/rest/services/WebMapServices/Institutions/MapServer) appeared in search results with broad institutional categories and a 2023 keyword. Its CHFS licensing lineage/currentness was not verified; it must not substitute for current licensed-provider data simply because it mentions childcare.

## Next bounded prerequisite

Find a publisher-linked, anonymous machine-readable listing or documented metadata interface for the kynect/CHFS provider source, or resolve the compliance page's provider-list link when accessible. Before implementing a success-capable preflight, establish exact Type I and license-status literals, record-key semantics, selected facility fields excluding contacts/home records, metadata/count-only operations, update-date meaning, delivery limits and full applicable notices. Then implement paired bounded prerequisite checks and an application-owned acquisition lifecycle. Do not invent Salesforce endpoints, scrape all ZIP/radius combinations as proof of completeness, or interpret an unavailable bulk contract as a categorical legal hold.

No connector, enrollment, acquired release, scheduled task or national reporting change resulted from this discovery.
