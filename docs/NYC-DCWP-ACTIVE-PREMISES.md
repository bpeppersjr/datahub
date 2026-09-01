# NYC DCWP active premise licenses

This connector acquires the official New York City Department of Consumer and Worker Protection `Issued Licenses` Socrata dataset (`w7w3-xahh`) and selects only rows whose current source status is `Active` and license type is `Premises`. The official dataset is automated and updated weekly.

The connector does not equate a license row with a business. It groups selected rows by DCWP's documented Business Unique ID, publishes one provisional license-business organization/site/establishment candidate for each accepted group, and preserves every active premise license as one-to-many evidence.

## Build and verify

```powershell
npm run nyc-dcwp:build
npm run nyc-dcwp:verify
```

## Privacy and semantic limits

- `Business Name` can be an individual's name and a licensed premise can be a residence.
- Individual license rows are excluded through the source query.
- Contact phone and free-form detail are excluded at query time.
- Only complete U.S. street-address groups with a mapped ZIP are normalized; intersections, landmarks, incomplete addresses, and invalid or conflicting groups are quarantined.
- Record-level selected and normalized artifacts remain local-review-only. Aggregate ZIP/source counts may be reported with attribution and limitations.
- `Active` is the publisher's current municipal-license status. It does not prove continuous operations, public access, solvency, or complete licensing coverage.
- Most NYC businesses do not require a DCWP license, so this source is not a complete NYC business denominator.

## Sources

- Dataset: https://data.cityofnewyork.us/Business/Issued-Licenses/w7w3-xahh
- Metadata: https://data.cityofnewyork.us/api/views/w7w3-xahh
- API: https://data.cityofnewyork.us/resource/w7w3-xahh.json
- Terms: https://data.cityofnewyork.us/stories/s/Terms-of-Use/k9k7-3cje/
- Open Data FAQ: https://opendata.cityofnewyork.us/faq/
- Open Data Law: https://opendata.cityofnewyork.us/open-data-law/

## Current state

Release `nyc-dcwp-active-premises-20260901-041708420Z-74171f7b` independently verifies all 21 artifacts totaling 91,533,434 bytes. The immutable source release `nyc-dcwp-active-premises-2026-08-20-6c47b96b3ab94aec` contains 35,245 `Active` + `Premises` license rows from the catalog refresh dated `2026-08-20T13:24:53Z`, representing 31,828 Business Unique ID groups before address and privacy quality gates.

The connector accepts 34,397 license rows and publishes 31,163 licensed sites and Business Unique ID organizations. It quarantines 848 rows across 665 business groups: 618 non-complete address rows, 179 invalid-state rows, 34 missing-address rows, 13 invalid or unmapped ZIP rows, and four source-state/postal-label conflicts. Of the published sites, 26,532 carry source coordinates, 28,034 report an NYC borough, and 3,129 are outside or missing that borough scope. The 37,828-row ZIP union includes 1,550 ZIPs with source contributions while retaining the national Census ZBP/ZCTA denominator context.

The release is complete for the selected official Active/Premises snapshot, not complete for all NYC businesses. Record-level artifacts remain `local-review-only`; the national registry and coverage layers preserve that policy and do not infer ownership, parent companies, network affiliation, public access, or continuous operation.
