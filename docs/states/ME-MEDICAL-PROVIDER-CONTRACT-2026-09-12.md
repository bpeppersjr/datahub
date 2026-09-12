# Maine medical-provider contract observations — 2026-09-12 UTC

This is a bounded discovery record, not a completed collector contract or acquisition-readiness approval. Observations were reviewed by the integrator and an independent reviewer. No provider list, export or provider records were acquired. September 12 UTC corresponds to September 11 in America/Chicago.

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

No provider links were detected on this step. No provider-list POST, provider-list retrieval or export request was performed. There are no collected provider rows or accepted acquisition artifacts to promote.

## Source guidance and policy boundary

The official [Provider Search Help](https://gateway.maine.gov/dhhs-apps/aspen/help.asp) documents category/subtype selection, county/town selection, selecting all results and spreadsheet output. It also discusses service areas that are not necessarily provider locations. Search geography must therefore remain distinct from reported addresses and verified premises; category or service-area selection cannot establish physical-site membership or current operations.

Maine's [official disclaimer](https://www.maine.gov/portal/policies/disclaimer.html) limits assurances about accuracy and currentness. It is neither a blanket automation ban nor an unrestricted redistribution license. Complete an internal, minimized-use assessment before implementing collection; infer no public-export permission from public access or spreadsheet availability.

## Next bounded step

Inspect the ordinary select-all/button behavior and the meaning of an empty county/town selection before submitting a bounded provider-list request. Then establish the provider-list schema, completeness/pagination behavior, source identifier stability, address role, license/status semantics and export contract. Retain only the evidence and fields authorized by the reviewed internal-use scope. Do not infer a hidden endpoint, bypass a future barrier, assign search ZIP/county geography as an address, or claim statewide completeness from the selection page.

This is a new Maine contract lead, not a standalone acquisition-ready connector. Overture remains the strongest nationwide next candidate, but fresh large-acquisition approval is still pending. Automatic goal continuation is not that approval. See [collection next actions](../COLLECTION-NEXT-ACTIONS-2026-09-12.md).

Prepared by the supported Astra documentation agent from the reviewers' observations. This change is documentation only: no code, runtime state, approvals, schedules, acquisitions, tests or restarts were changed or initiated, and no commit was made by this agent.
