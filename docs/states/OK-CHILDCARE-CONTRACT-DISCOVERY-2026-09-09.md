# Oklahoma childcare: delivery-contract discovery

Observed September 9, 2026. This is bounded source/documentation inspection, not a provider acquisition or collection enrollment. No provider-results page, provider detail, inspection report, account, submission or bulk export was requested. Search indexing incidentally exposed result labels; those are not retained as business records.

## Official scope and temporal boundaries

The [Oklahoma Human Services provider page](https://www.oklahoma.gov/okdhs/services/child-care-services/providers-educators.html) links directly to [childcarefind.okdhs.org](https://childcarefind.okdhs.org/). The landing page supports address and route searches. Its public FAQ and results client are accessible without signing in. The provider page's KinderSystems announcement concerns provider payments and attendance, not a verified replacement bulk business directory.

The [locator fact sheet](https://oklahoma.gov/okdhs/services/child-care-services/cclfactsheet.html) describes program name/address/rating and monitoring history. Historical monitoring and compliance findings are not evidence that a business remains operating today. Do not ingest complaint narratives, background-check information, people or contact details into a business-discovery contract.

The [current locator FAQ](https://childcarefind.okdhs.org/faq) describes five Star levels, whereas the separately maintained fact sheet describes an older four-level scheme. This discrepancy is a reason to validate the live categorical domain, not to choose one silently. Quality rating, subsidy acceptance and vacancies are distinct from current licensing/operating status. The FAQ directs users to individual programs for availability; lack of availability must not be interpreted as closure.

## Concrete published-client evidence

A native GET of the homepage returned 13,952 bytes and published script URLs. The linked build manifest (1,615 bytes) identifies `/providers`, `/providers/[vendorId]` and the associated report route. No vendor ID was enumerated or substituted into a request.

The linked [results-page script](https://childcarefind.okdhs.org/_next/static/chunks/pages/providers-6ad2917b8ded4ba3.js) returned 21,396 bytes, SHA-256 `baa2f178389f7609d6cbcbfc44215204aa0aeba4c8ce1020a8960ef7edfaa853`. This hash identifies inspected client code, not an immutable licensed data release. Raw script bodies were examined in memory, not installed as application dependencies or saved as provider evidence.

Static inspection shows:

- A `childcareProviders` result property and display fields `address`, `facilityType`, `hours`, `isSubsidyAccepted`, `name`, `officialDoingBusinessAs` and `vendorId`.
- A center-versus-home display branch comparing `facilityType` with a `ChildcareCenter` enum member. Its underlying value/domain has not yet been verified; do not invent the center-selection parameter.
- A server-rendered page marker (`__N_SSP`). This does not establish a documented public API, pagination or unattended-use contract.
- Optional coordinates, with records lacking coordinates excluded from the map but retained in the list. A future collector must not use map marker count as the roster denominator. Datum, accuracy and address matching are unverified.
- The visible list count is derived from the supplied result array's length. This proves neither statewide total nor completeness across geographic filters.

No request to a guessed API, Next data route, geocoder or map provider was made. The observed field names describe a UI model, not verified raw data types or selected-delivery schema. ZIP5/ZIP4 serialization, stable identity lifecycle, pagination and current-status fields remain unresolved.

## Source-use boundary

The locator links to the state's [policy index](https://oklahoma.gov/about/policy-disclaimers.html), [privacy notice](https://oklahoma.gov/about/privacy-policy.html) and [copyright notice](https://oklahoma.gov/about/copyright-and-protection-acts.html). These establish website notices, not a dataset-specific open license or unlimited bulk redistribution permission. The privacy page discusses public-record access and website information collection; it does not by itself authorize every proposed downstream use. No agreement was accepted and no legal prohibition on internal business analysis is asserted by this assessment.

## Next implementable prerequisite

Resolve the exact published filter enum/URL mapping from the already identified client dependencies. Then validate one bounded center-only ordinary search response, with provider values suppressed from diagnostics and no geocoder calls. Establish result limits, raw schema, address-role/ZIP semantics and source status before planning statewide acquisition. Capture complete applicable use notices and a source-specific internal-use decision separately from technical reachability.

Only after these gates should Co*Tive receive a fixed, tested collector with an operation ID and persisted receipt. Acquisition and refresh remain un-enrolled. No national totals, production pointers or protected production pins changed. This documentation-only discovery needs no runtime migration; reverting this note does not remove retained datasets.
