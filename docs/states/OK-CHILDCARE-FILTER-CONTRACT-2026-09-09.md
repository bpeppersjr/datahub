# Oklahoma childcare: published filter contract

Observed September 9, 2026. This resolves the static-client prerequisite in [the discovery note](OK-CHILDCARE-CONTRACT-DISCOVERY-2026-09-09.md), not a provider acquisition, tested server contract, or enrollment. Only the public homepage and its published JavaScript dependencies were requested. No provider results, details, reports, geocoder, account, guessed API or Next data route was requested. Script bodies were inspected in memory, not saved as data releases or executed as dependencies.

## Evidence inventory

The [official locator homepage](https://childcarefind.okdhs.org/) publishes the scripts below; the build manifest also lists the results route and shared chunk 521. All native responses were HTTP 200, decoded bodies were capped at 1 MB per request, requests were serial with a 20-second deadline, redirects rejected, and no credentials supplied. A repeat inspection of chunk 521 yielded the same bytes and hash. An independent web text view of the homepage was also read; it was not a provider search.

| Published resource | Decoded bytes | SHA-256 |
|---|---:|---|
| [Homepage](https://childcarefind.okdhs.org/) | 13,952 | `9e6b75ed2a63a2a2dae012c3e62f9977122b3b663c50c674e38c1441597c19ea` |
| [Build manifest](https://childcarefind.okdhs.org/_next/static/-Z4vSBQhr5-E1Fy5xTW5V/_buildManifest.js) | 1,615 | `8f7afd15eb6ef719e405aa50b6620750f8987f803ced49386e116f445869b268` |
| [Shared search chunk 521](https://childcarefind.okdhs.org/_next/static/chunks/521-358ba3d28809db82.js) | 34,517 | `62305f4dac2fa558c7961faabbb5a074b245d8e73f85069029df76bf4693e217` |
| [Shared chunk 329](https://childcarefind.okdhs.org/_next/static/chunks/329-a975243acbacc5f3.js) | 47,047 | `b6766abbdab14cb04746e46ea8c2f9491c91a9761cac782049fbc78ba6d6b8d2` |
| [Results-page script](https://childcarefind.okdhs.org/_next/static/chunks/pages/providers-6ad2917b8ded4ba3.js) | 21,396 | `baa2f178389f7609d6cbcbfc44215204aa0aeba4c8ce1020a8960ef7edfaa853` |

Hashes identify the inspected assets, not authorization, record accuracy, or an immutable source-data release. Chunk 329 was inspected as a linked dependency but supplies no necessary evidence for the mappings below. Public-client service credentials, if present, must not be reused or copied into application configuration or documentation.

## Exact center selector

In chunk 521, module `4584` exports the facility enum as `$4`; module `1169` binds it to the form/query key `facility-type`; module `9803` supplies the display labels. The results-page script compares its `facilityType` field with this same `ChildcareCenter` member.

| Enum member | URL/radio value | Filter label | Default behavior |
|---|---|---|---|
| `ChildcareCenter` | `childcare-center` | Child Care Center | Explicit center selection |
| `ChildcareHome` | `childcare-home` | Child Care Home | Explicit home selection; outside the intended center cohort |
| `Both` | `both` | Both | Initial/reset value; omitted when serializing default filters |

Thus the center-selection query component is exactly `facility-type=childcare-center`. It is not `center`, a numeric type code, or a rating. This is verified client syntax only; server enforcement and delivered raw `facilityType` values have not been observed. The UI tooltip's typical size description is not a legal center definition and must not become a row-selection rule.

## Search route and finite mappings

Chunk 521 module `7373` renders a GET form with action `/providers`. Its JavaScript submit handler builds `URLSearchParams`, then calls the router with pathname `/providers` and the serialized query string. These are ordinary page-navigation parameters, not evidence of a documented JSON API. Internal form keys `search-filter` and `search-mode` organize the controls; the serializer instead emits each chosen mode's key below.

| Search mode enum | Query key | UI label |
|---|---|---|
| `Location` | `location` | Address |
| `CityName` | `city-name` | City Name |
| `ContractNumber` | `contract-number` | Contract Number |
| `K8Number` | `k8-number` | K8 Number |
| `ProviderName` | `provider-name` | Provider Name |
| `ZIPCode` | `zip-code` | ZIP Code |

Mode values come from module `4584`; bindings and labels from `8957`. Location inputs are trimmed and nonempty stops append repeated `location` keys. Other string inputs append their mode key. Additional search bars can repeat keys; the client parser takes only the first string for several scalar fields. Do not infer server AND/OR behavior or a multi-ZIP batch capability from this UI structure.

A *constructed, unrequested* center-only ZIP navigation example is `/providers?zip-code=73102&facility-type=childcare-center`. The ZIP is illustrative, not a validated coverage bucket or a fetched result. Client parsing uses `Number.parseInt` for ZIP and distance; it is not strict five-digit validation. A future collector must validate ZIP5 independently and keep ZIP4 separate, without assuming this parser defines delivered address fields.

Additional finite controls verified in chunk 521:

| Query key | Published values | Serialization/default |
|---|---|---|
| `is-subsidy-accepted` | `yes`, `no`, `both` | Scalar; `both` default omitted |
| `sort-order` | `distance`, `star-level` | Scalar; `distance` default omitted |
| `star-level` | `1`, `2`, `3`, `4`, `5` | Repeated checked values; all selected initially; default omitted |
| `hours` | `daytime`, `drop-in`, `evening`, `overnight`, `school-vacation`, `school-year`, `sick-care`, `summer`, `weekend`, `year-round` | Repeated checked values; unchecked initial state displays all; default omitted |
| `maximum-distance` | UI slider integers 1–30 miles | Enabled only when the URL has `location`; default 5 for zero/one location, 1 for multiple stops; emitted only when touched and nondefault |

Modules `678`, `1086`, `4118`, `8251`, and `3504` establish these bindings respectively. Client enum coercion filters to published values; an invalid facility enum can fall back to the default Both in form reconstruction. A center collector must therefore fail closed on unexpected types rather than trust an echoed URL. Star levels are quality categories, not operating-status evidence. The five-value current client domain resolves the older fact sheet discrepancy for this UI only.

## Next bounded validation, not performed here

1. Recheck the published client hash and compare any drift before relying on these mappings.
2. In a separately scoped validation, confirm the ZIP-mode and center-radio UI generate the documented route. Suppress provider values from diagnostics, disable location detection, and prevent map/geocoder requests and automatic detail prefetch. A page load can execute third-party map code, so use request interception rather than assuming ZIP input alone prevents ancillary calls.
3. Validate one ordinary center-only ZIP response with fixed byte/row/time limits, no retries or enumeration. Record only aggregate schema/type/count metadata for this prerequisite. Check whether all delivered rows are centers, whether the source signals truncation/pagination, and which address/ZIP/identity/status fields actually exist. Empty or capped results cannot establish statewide absence or completeness.
4. Keep unresolved quality facts explicit: source-point accuracy/datum, address role, update time, identifier lifecycle and operating status remain unknown until evidenced; unknown quality is not itself a reason to discard otherwise usable source records. Applicable source-use decisions and bounded unattended delivery still need their own collector contract before enrollment.

No runtime/configuration files, acquired data, national pointers, or protected production pins changed. There is no migration or source refresh; rollback is removal of this documentation note.
