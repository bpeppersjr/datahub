# Maine medical-provider contract observations — 2026-09-12 UTC

This is a bounded discovery record, not a completed collector contract or acquisition-readiness approval. Observations were reviewed by the integrator and an independent reviewer. Later transient list/detail inspections are recorded below; no provider dataset or export was retained or published. September 12 UTC corresponds to September 11 in America/Chicago.

## Ordinary session flow observed

The public ambulatory-surgical-center category anchor is `type_pop_services.asp?types=12`. The initial page exposes form `type_list`, posting to `type_pop_services.asp`, and form `facsearch`, posting to `facility_list.asp`. Forms carry a hidden `CSRFToken`; no token values were retained.

The final ordinary session followed HTTP `200 → 302 → 200` to `county_town.asp`. The category redirect and subsequent session redirect lead to the ordinary county/town selection step, not an access denial. No barrier was observed. Do not repeat the same probe on the premise that this redirect is a blocked request.

The public `js/index.js` asset was 515 bytes, SHA-256 `9c77575a2cfe2133274088382a2aa451cde6785e74fbcc400cafc5cc0f9e5977`. Its inspected behavior was limited to UI/name validation; it did not establish the provider-list or export contract.

The county/town page was observed at `2026-09-12T01:35:39.218Z`: 13,579 bytes, SHA-256 `de82a6615a75e384913f092244c8865a870e2929b259aaf153ceeb6859263ff3`. These page hashes are observation fingerprints, not stable version pins: session-specific CSRF values may change the bytes. Cookies and tokens were kept only in memory and were not logged or saved in this document.

## County/town form surface

Form `county_city` posts to `/dhhs-apps/aspen/facility_list.asp` and contains a hidden `CSRFToken`. All observed county and town checkboxes were unchecked.

| Repeated field | Public values observed |
| --- | --- |
| `counties` | `ANDROSCOGGIN`, `AROOSTOOK`, `CUMBERLAND`, `HANCOCK`, `KENNEBEC`, `PENOBSCOT` |
| `FAC_CITY` | `[AUBURN]`, `[AUGUSTA]`, `[BANGOR]`, `[ELLSWORTH]`, `[LEWISTON]`, `[PORTLAND]`, `[PRESQUE ISLE]`, `[WATERVILLE]`, `[WESTBROOK]`, `[YARMOUTH]` |

Other observed controls: `bcounties`, `bcities`, `clearMe`, `previous`, and `submit`. Their names alone do not establish submitted values, select-all behavior, or empty-selection semantics. Six county values and ten town values describe this observed form, not a complete statewide provider inventory.

No provider links were detected on this initial selection step. At that point, no provider-list POST, provider-list retrieval or export request had been performed. There are still no retained provider rows or accepted acquisition artifacts to promote.

## Subsequent list and detail observations

These observations extend the initial selection-page inspection; they are not new source requests made by this documentation update.

- The observed `js/county_town.js` select-all behavior checks all county boxes independently of town boxes. Its SHA-256 was `ed56c923e27b02e9d2bab22dc818cfbe37f49050925b172e3671cfcaa0edecf3`. Use the actual observed county roster, not an unverified empty-selection shortcut; leave town boxes unselected.
- A correctly serialized all-county POST returned HTTP 200, 14,952 bytes at `2026-09-12T01:38:01.352Z`, SHA-256 `23d68adcf2b33a3aa9b14d9437fef5688b824d1ca503aff045083b38c73ab6e13`. It exposed 17 provider selections and headers Provider, City, Phone, County and State. These are selections, not 17 independently verified businesses.
- The list form is `facility_list`, POST to `aspen_details.asp`, with hidden `CSRFToken` and `referer`, repeated `which` controls, and the named `details` submitter. Only successful named controls are submitted. The observed `js/facility_list.js` SHA-256 was `16f35359aa4e80438249c272c7209663181f78a8651b205c9bfd49d7d9f3e3bf`; client `paging:false` is not proof of server-side completeness.
- A later detail inspection returned HTTP 200, 29,977 bytes at `2026-09-12T01:39:44.045Z`, SHA-256 `e9f7e9e7435c88fa441bfb4de1dafe0fec046c1116da29aa0638df65a49a11a9`. Recognized labels included Provider Type, License, Administrator, Phone and Fax. That session's preceding county diagnostic accidentally included an extra literal `undefined` field: it is not exact end-to-end conformance proof and must not be copied into the connector.
- Details advertised form `get_excel`, POST to `make_excel.asp`, with only an unnamed submit control. The ordinary export therefore appears to require the current session and an empty POST body, not a guessed download hyperlink. The inspection session was closed without requesting the export.

No provider/contact values, raw HTML, cookies, CSRF tokens or request bodies were retained. Dynamic page hashes are observation fingerprints, not stable source-version pins. Export format, selected header schema, address/ZIP layout, identifier semantics, license status and list/detail/export row conservation remain unverified.

## Source guidance and policy boundary

The official [Provider Search Help](https://gateway.maine.gov/dhhs-apps/aspen/help.asp) documents category/subtype selection, county/town selection, selecting all results and spreadsheet output. It also discusses service areas that are not necessarily provider locations. Search geography must therefore remain distinct from reported addresses and verified premises; category or service-area selection cannot establish physical-site membership or current operations.

Maine's [official disclaimer](https://www.maine.gov/portal/policies/disclaimer.html) limits assurances about accuracy and currentness. It is neither a blanket automation ban nor an unrestricted redistribution license. Complete an internal, minimized-use assessment before implementing collection; infer no public-export permission from public access or spreadsheet availability.

## Next bounded step

Finish and test the app-owned metadata preflight before another native session. Reproduce the exact successful named-control flow, keep session values in memory, and inspect the advertised POST export once within the preflight's reviewed limits. Do not repeat the earlier ad hoc list probes. Establish export format/schema and count conservation before claiming collection readiness; source identifier stability, address role, license/status semantics and permitted collection scope remain separate gates. Retain only authorized metadata, not provider values. Do not infer a hidden endpoint, bypass a future barrier, assign search ZIP/county geography as an address, or claim statewide completeness from the selection page.

This is a new Maine contract lead, not a standalone acquisition-ready connector. Overture remains the strongest nationwide next candidate, but fresh large-acquisition approval is still pending. Automatic goal continuation is not that approval. See [collection next actions](../COLLECTION-NEXT-ACTIONS-2026-09-12.md).

Prepared by the supported Astra documentation agent from the reviewers' observations. This change is documentation only: no code, runtime state, approvals, schedules, acquisitions, tests or restarts were changed or initiated, and no commit was made by this agent.
