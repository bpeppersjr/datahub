# Kansas food portal: observed form contract

Read-only inspection on September 12, 2026 of the publisher-linked [public inspection search](https://portal.kda.ks.gov/Food/FoodInspectionSearch). No search, detail, map, export, CAPTCHA execution or token generation was performed. No provider records were obtained. This supplements the initial discovery note; it does not establish an unattended inventory collector or broaden source-use policy.

## Observed delivery metadata

The HTML form `inspectionSearchForm` uses POST action `/Food/FoodInspectionSearch/_Search`. Named controls are `__RequestVerificationToken`, `page`, `EstablishmentName`, `InCompliance` (checkbox and hidden control), `OutOfCompliance` (checkbox and hidden control), `Address`, `City`, `StateAbbreviation`, `CountyGuid`, `ZipCode`, `InspectionDateFrom`, and `InspectionDateTo`. No token, cookie or form-secret values are recorded here.

The inline `runSearch(page)` handler serializes the form, calls `grecaptcha.ready` and `grecaptcha.execute` with action `inspection_search`, and appends a `recaptchaToken` parameter. It POSTs to the observed form action and inserts returned HTML into `#results-container`. A `.fis-page` click handler reads `data-page`, ignores invalid/disabled/active selections, and calls `runSearch(page)`.

Additional advertised handlers reference `_PastInspections`, `_MapLocations`, `_Violations`, and `Export` beneath the same `/Food/FoodInspectionSearch` route. These endpoints were not requested. Their presence does not establish response schemas or export authorization.

## Evidence and limits

Three bounded GETs of the initial page returned HTTP 200 and 86,297 bytes each, with no redirect following, cookies supplied or linked-script fetching. The third corrected an inspection-code substring boundary in the second extraction; the second's false gate flags were an extraction error, not evidence of an ungated source version. The final HTML SHA-256 was `8bc5c4564999ea7e729016e188e9a0a7074641c2d1f730759e853845dbac9908`. Dynamic HTML hashes are observation identifiers, not immutable publisher release pins. Raw HTML and secrets were not persisted.

The public page describes free, no-sign-in access, nightly updates, and blank-filter searches. Its normal query path nevertheless invokes reCAPTCHA. No CAPTCHA bypass, direct tokenless request or credential assumption is warranted. A permitted ordinary interactive flow would need separate evaluation before unattended source-query capability could be claimed.

Page-number navigation is visible in script, but result row structure, stable establishment identifiers, page size, total counts, subtype classification, export schema and current-license coverage remain unobserved. Inspection events describe visit-time findings, not current operating status or an establishment denominator. Groceries cannot be separated from restaurants and other food operations merely by selecting this source.

## Next bounded implementation

A metadata prerequisite can validate the exact initial form, publisher origin, control names, query gate and advertised pagination handler without sending a provider query. It should report the challenge-mediated query requirement explicitly, not advertise acquisition-ready status. Before collecting any inventory, establish the ordinary allowed query path, result/count conservation and source-use scope, preserving the official public-record commercial-use warning and the historical/current-platform distinction. No source retry or bulk acquisition is authorized by this note.
