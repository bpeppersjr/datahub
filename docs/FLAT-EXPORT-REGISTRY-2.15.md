# Retained registry 2.15 flat-export compatibility

This data-service slice supports the existing registry 2.15 reporting contract. It does not acquire data, rebuild registries, change production pointers or introduce credential-to-business conversion.

- `business-flatfile-compatibility.mjs` recognizes exact registry 2.13 recovered TN, 2.14 fresh TN, and 2.15 OH with explicit TN origin `null`, `fresh` or `recovered`. It checks publisher/status, dependency roster and TN release-origin pattern; unsupported reporting versions and misplaced OH declarations reject.
- The composer loads the retained OH app context, validates each OH reporting row against it, enforces reporting partition/policy, and verifies complete OH membership before publishing. It does this before export filters, so a filtered export cannot hide corrupted or omitted reporting rows.
- Combined missing-ZIP accounting equals TN plus OH. Neither missing ZIPs nor source points are converted into inferred geographic assignments.
- The export childcare category now includes OH. This is an explicit export-category extension, not a change to map adoption or map business counts. OH output remains local-review-only, identity-ineligible and geographically assignment-ineligible. The new selectable/default `governed_geographic_assignment_eligible` output field preserves the false OH flag; other sources without the field remain null.
- `reporting/mn-construction/credentials.jsonl` retains its separate credential artifact type and remains outside location-profile export selection. Its 11,456 production credential rows are not added to exported business/site counts.
- Cancellation checks bracket existing retained OH context loading. That loader has no signal parameter, so cancellation during its local verification waits for it to return; no new source request or retry is introduced. Whole-membership verification accepts the cancellation signal.

Focused offline tests export the actual childcare category for 2.15 fresh/recovered/no-TN synthetic fixtures, check resulting OH rows and local-review policy, public-mode exclusion, nonzero OH missing-ZIP conservation, wrong dependency pins, rehashed duplicate/assignment-flag substitutions, omitted membership, pre-abort and credential exclusion. Existing 2.13/2.14 export tests remain in the suite.

A bounded read-only check of the production manifest accepted registry `national-business-registry-20260911-022652067Z-1ec656c3`: recovered TN, 172 missing TN ZIPs, 4,237 OH rows with zero missing ZIPs, and 11,456 separate MN credential rows. This was manifest compatibility only, not full source replay or a production export. No 33-million-profile scan was performed. Root owns final integration/runtime verification.
