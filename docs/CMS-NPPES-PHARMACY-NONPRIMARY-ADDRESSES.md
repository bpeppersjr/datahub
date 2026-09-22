# CMS NPPES pharmacy non-primary address projection

This retained-only projection links each accepted NPPES non-primary practice-location row to the retained community/retail pharmacy projection by exact NPI. It reads only the exact current pharmacy release and the NPPES organizations manifest pinned by that pharmacy release. It makes no network requests and does not change either source pointer.

Run `npm run pharmacy:nppes:secondary:build` to publish a separately versioned immutable release at `data/business-sources/cms-nppes-pharmacy-nonprimary-addresses`. Run `npm run pharmacy:nppes:secondary:build -- --inspect` to recompute coverage from the retained inputs without publishing a release, or `npm run pharmacy:nppes:secondary:verify` to independently verify the current projection. The build streams source partitions and output shards, checks cancellation, enforces size bounds, writes the manifest last, then publishes its own pointer.

Every row preserves its source NPI, source practice-location record ID, pharmacy projection record ID, primary/secondary role, and ZIP5 and ZIP4 in separate fields. Records are explicitly described as provider-reported non-primary addresses associated with pharmacy-classified organizations. They are not confirmed pharmacy locations or evidence of current operations. These records do not contribute to business, site, or national totals.

The separate view is available through the existing authenticated read-only pharmacy API by adding `address_role=non-primary-practice-location` to `/api/business-map/pharmacies/map` with a state and ZIP5. The Pharmacy heatmap shows these rows in a separate section below primary-address names and reports the computed coverage summary. A secondary-only ZIP can be queried directly even when the primary pharmacy map has no source count there.

Current inspection of the retained releases below recomputes the figures from their artifact records; they are not build constants:

| Measure | Recomputed count |
|---|---:|
| Reported secondary address rows | 420 |
| Distinct pharmacy-classified NPIs | 332 |
| Distinct reported ZIP5 values | 377 |
| ZIP5 values with secondary addresses but no primary pharmacy-address count | 4 |

The inspected inputs were pharmacy release `cms-nppes-community-retail-pharmacies-20260922-173220059Z-a8d8f5a8` and its exact pinned NPPES organizations release `cms-nppes-organizations-20260903-013253062Z-7ee97568`.

## Published retained view — September 22, 2026

Co*Tive published release `cms-nppes-pharmacy-nonprimary-addresses-20260922-225434542Z-59f8001a` from those exact local inputs and independently verified all 420 rows, 332 NPIs, 377 ZIP5 values, and four secondary-only ZIP5 values. The build and verification performed zero source-network requests. This publication changes only the dedicated secondary-address view; it does not change the NPPES source, pharmacy projection, national registry, coverage, or production pointers.
