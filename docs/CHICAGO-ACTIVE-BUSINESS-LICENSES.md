# City of Chicago current active business licenses

This connector acquires the official City of Chicago Department of Business Affairs and Consumer Protection `Business Licenses - Current Active` Socrata view (`uupf-x98q`). The official view is derived from source dataset `r5kz-chrr`, is updated daily, and filters for issued (`AAI`) licenses whose expiration date is later than the view's current cutoff date.

The connector does not equate a license row with a business. It groups every selected source row by the publisher's account number and site number, publishes one provisional organization/site/establishment candidate for that group, and preserves all active licenses and business activities as source-backed one-to-many evidence.

## Build and verify

```powershell
npm run chicago-licenses:build
npm run chicago-licenses:verify
```

## Privacy and semantic limits

- Legal names can identify sole proprietors and licensed addresses can be residences.
- Addresses marked as redacted by the publisher are quarantined and never reconstructed.
- Ownership, officer, agent, contact, payment, and application-workflow fields are not acquired.
- Record-level selected and normalized artifacts remain local-review-only. Aggregate ZIP/source counts may be reported with attribution and limitations.
- `AAI` plus future expiration is municipal license status. It does not prove continuous operations, public access, solvency, or complete licensing coverage.
- Businesses or activities exempt from a City license are absent, so this is not a complete Chicago business denominator.

## Sources

- Dataset: https://data.cityofchicago.org/d/uupf-x98q
- Metadata: https://data.cityofchicago.org/api/views/uupf-x98q
- API: https://data.cityofchicago.org/resource/uupf-x98q.json
- Data Portal FAQ: https://data.cityofchicago.org/stories/s/Data-Portal-FAQ/iy9c-7e89/
- Chicago open-data executive order: https://www.chicago.gov/city/en/narr/foia/open_data_executiveorder.html

## Verified live release

Release `chicago-active-business-licenses-20260901-013400018Z-55f64335` independently verifies all 21 artifacts totaling 98,862,337 bytes. The immutable source release `chicago-active-business-licenses-2026-08-29-93756072f7a55bb5` contains 53,863 license rows from the portal refresh dated `2026-08-29T09:58:27Z`, using the official view cutoff `2026-08-31`.

The connector accepts 52,885 current-active license rows and groups them into 42,864 licensed sites across 35,694 account-level organizations. It quarantines 978 rows across 956 site groups: 840 publisher-redacted-address rows, 99 invalid or unmapped ZIP rows, 34 source-state/postal-label conflicts, and five invalid source-state rows. Of the published sites, 39,683 carry source coordinates, 39,706 report a Chicago ward, and 3,158 are outside or missing that ward scope. The 37,828-row ZIP union includes 1,033 ZIPs with source contributions while retaining the national Census ZBP/ZCTA denominator context.

The release is complete for the selected official current-active view snapshot, not complete for all Chicago businesses. Record-level artifacts remain `local-review-only`; the national registry and coverage layers preserve that policy and do not infer ownership, parent companies, network affiliation, public access, or continuous operation.
