# New Hampshire visible-result delivery contract

## Verified source evidence

On September 10, the current [DHHS public search page](https://new-hampshire.my.site.com/nhccis/NH_ChildCareSearch) was inspected as a read-only source-contract check. One direct GET returned HTTP 200 and 250,352 decoded bytes, under a 1,000,000-byte acceptance ceiling and 20-second timeout with redirects rejected. The HTML was inspected in memory, not retained as a dataset. There was no search submission, export click, provider-detail request, geocoder request or new provider observation in this check.

The currently delivered result-rendering code contains two `result-list` branches. Both build the same name/link/address structure relevant to a minimal business projection:

| Visible result component | Source rendering basis | Successor extraction boundary |
| --- | --- | --- |
| Program name | Program name inside the first paragraph's detail anchor | Read the anchor's direct text nodes; exclude accessibility and arrow spans |
| Detail identifier | Same-origin detail anchor with an `id` query parameter | Retain the observed link/identifier; do not navigate or infer identifier lifecycle |
| Address | Shipping street, city, state and postal fields in the first direct address div | Preserve visible lines; normalize only unambiguous fields, keeping ZIP5 and ZIP4 separate |

The observed detail path is `/nhccis/NH_childcaresearchaccountdetail`. The result container is `ul.result-list`; the relevant name/address parent has class `slds-tile__detail`. The program name anchor is in its initial paragraph; the address is in its initial direct div. Subsequent directions links and other content are outside the selected projection. These findings come from the current public renderer, not from reading hidden provider objects or remoting responses.

Later diagnostic validation corrected an important selector assumption: the separate contact column also uses `slds-tile__detail`. Select the business parent by the observed detail link in its direct initial paragraph, not by requiring exactly one class match in the entire card. The corrected callback has offline browser-fixture coverage. A subsequent [fixed native run retained six selected records](NH-RETAINED-VISIBLE-03755-2026-09-10.md); broader collection and search completeness remain unverified. See the linked prerequisite report for the preceding native failures and correction evidence.

This resolves a specific next-action question: the visible address is rendered from shipping fields, so a successor must not silently use billing fields, a directions URL, publisher state or query ZIP as an address substitute. Shipping-field rendering does not independently establish physical-premises status.

## Provenance and confidence limits

The public portal warns that certain program-supplied information is not verified by DHHS and directs users to the programs for current details. Therefore current operations, address accuracy and completeness remain unknown. The public information function is not a blanket bulk-use or redistribution license.

The earlier search-export diagnostic established six visible entries for the fixed Licensed Group Child Care Program / ZIP 03755 lookup, but this read-only check did not repeat that lookup or reconfirm its count. It must not update those programs' observation timestamps, claim six currently verified records, or count a new acquisition.

The secondary NH Connections explanation URL returned HTTP 403 through the web text tool during this review. It was not retried or bypassed. That auxiliary-page response is not a denial from the DHHS search endpoint and is not evidence that NH prohibits collection.

## Implementation consequence

Proceed with an independent visible-result parser, not relaxed CSV quoting. Its acceptance tests should bind the exact selected program type and ZIP, require a settled displayed count to match visible cards, reject ambiguous/duplicate detail links and extra projected fields, preserve missing/redacted address values, and leave absent coordinates null. A later bounded native run must verify the actual rendered selectors before source enrollment; this source-code observation does not replace that test.

Only the schema/rendering contract was inspected in this source-contract check. No business dataset, source-current pointer, app enrollment, schedule or production release changed. The existing local Sites application and hosting configuration are unchanged. Later implementation and native-attempt evidence are tracked in [the visible-result prerequisite report](NH-VISIBLE-RESULT-PREREQUISITE-2026-09-10.md); Oklahoma's separate approval and failed dispatch are tracked in its own reports.
