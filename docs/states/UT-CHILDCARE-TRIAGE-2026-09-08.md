# Utah childcare source triage — September 8, 2026

## Decision

Official statewide source discovery succeeded, but a documented machine-readable selected-field delivery contract remains missing. Do not implement a guessed API or enumerate the public search. A currently linked September 2026 regulated-program PDF is a credible retained-document candidate for a separately scoped parsing assessment, not a verified bulk/API connector yet.

This bounded review requested official documentation pages only. It did not request provider records, IDs, report PDFs, exports, accounts or applications. No source-data files were retained. The initial repository search found no existing Utah childcare connector or state-source note in the searched docs/states, config/connectors and config/source-policies directories.

## Primary evidence

- [Utah DHHS Division of Licensing and Background Checks](https://dlbc.utah.gov/) states that it licenses child care along with other regulated program classes. The older `https://childcarelicensing.utah.gov/` redirected here during this review.
- [Official reports index](https://dlbc.utah.gov/information-for-the-public/reports/) separates child care from health facilities and human services. It describes its regulated-child-care list as currently regulated programs. It separately links registered residential providers who are not regulated; that list must not be merged into a licensed-center cohort.
- The reports index's exact current regulated-child-care target was `https://dlbc.utah.gov/wp-content/uploads/All-Child-Care-Licensing-Facilities-Report-September-2026.pdf`. Only the link was inspected; the PDF was not requested. Therefore its actual schema, types, row count, center/home classifications, address/ZIP coverage and contents are unverified.
- The same index links `https://dlbc.utah.gov/wp-content/uploads/Total-Facilities-and-Capacity-Report-August-2026.pdf` as statistical totals. This document was not requested. Neither filename establishes an exact observation date or a guaranteed refresh service level.
- [Official facility-search guidance](https://dlbc.utah.gov/information-for-the-public/find-a-facility/) links licensing-record search at `https://provider.dlbc.utah.gov/`. It explains that public compliance history covers the prior 36 months and defines sanctioned facilities as under department agency action. This is not evidence of a current business-activity classifier or documented bulk endpoint. No search was submitted.
- [DWS Care About Childcare](https://jobs.utah.gov/occ/cac.html) describes public search by location, cost, type, licensing record and quality rating. It separately describes administrative accounts and the workforce registry. The official search target is `https://jobs.utah.gov/occ/cac/search/`; the page supplied no readable API/schema documentation. No query was submitted. The administrative/workforce and subsidy portals are out of scope.

## Unresolved contract boundaries

1. **Delivery:** no documented statewide JSON/CSV/API endpoint was established in this bounded review. This is an unknown implementation prerequisite, not proof that none exists or that access is prohibited.
2. **Scope:** establish exact source-native center versus home category values from a documented schema or bounded PDF assessment within the existing data-validation scope. Do not infer categories from names, capacities, addresses or the historical aggregate counts found in search.
3. **Fields:** license identifiers, names, address roles, ZIP representation and nullable semantics remain unverified. Geocode availability, CRS, precision and derivation are unknown; no point or geographic-assignment claim is justified.
4. **Time:** retain the report edition and eventual source observation separately. “Currently regulated” is the publisher's scope description, not independent verification of current operation, occupancy, unique business identity or source freshness.
5. **Usage:** official public publication is established; no dataset-specific machine-use or redistribution notice was established from the inspected pages. Do not convert this uncertainty into either blanket permission or a prohibition. Review the actual delivery document's notices and applicable publisher usage context before adopting retention/export policy. No agreement, payment or special legal-approval requirement was observed or accepted.

## Next bounded action

Resolve whether DLBC documents a machine-readable export associated with the published regulated-program report. If not, explicitly choose a bounded official PDF schema/notice assessment before building any acquisition path. Preserve all program classes until a verified center predicate is available, and keep future collection app-owned with immutable evidence and explicit missing-field gaps. Do not reuse a different Utah dataset's license or infer a source URL from the search application's internals.

## Native header check and inspection limitation

A single fixed-URL native HEAD request returned HTTP 200, `Content-Type: application/pdf`, `Content-Length: 332869`, Last-Modified `Tue, 01 Sep 2026 17:00:48 GMT` and ETag `"6a9704c0-51445"`. Redirects and credentials were disabled; the request had a 30-second deadline. No PDF body was downloaded by this check. These headers establish an observed small published object, not its schema, record count or freshness of individual licenses.

The web PDF reader then returned a non-retryable safe-open error before providing any content. It was not retried. That tool limitation is not a publisher access denial—the earlier native HEAD succeeded—and no actual PDF visual/schema assessment was completed. The next step remains bounded document inspection or an official machine-readable alternative, not a production acquisition or a new legal-approval requirement.

Follow-up: a [bounded local PDF assessment](UT-CHILDCARE-PDF-ASSESSMENT-2026-09-08.md) subsequently succeeded using the native public document response, without retrying the web reader. It establishes actual column/category observations and parsing hazards; the earlier content-unverified state above is historical. No production connector or app collection is implied.
