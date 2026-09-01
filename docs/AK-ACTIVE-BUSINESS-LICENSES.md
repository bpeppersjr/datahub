# Alaska active business licenses

This source adapter ingests the official full `Business License Download` and `NAICS Download` CSV files published by the Alaska Department of Commerce, Community, and Economic Development (DCCED), Division of Corporations, Business and Professional Licensing. It accepts only license rows whose source status is exactly `Active` and records a coherent observation window covering both downloads.

The source describes a business license as required for the privilege of engaging in business in Alaska. DCCED also says submitted information is not verified and disclaims accuracy and reliability warranties. Accordingly, this layer preserves source-defined active-license evidence without treating it as independent proof that a business is continuously operating, open to the public, solvent, or compliant with every other requirement.

## Privacy and address limits

Owners and every mailing-address field are excluded before persistence. Live profiling found phone-like and other unstructured content in `PhysicalLine2`, so the raw value is also excluded; only conservative unit designators such as apartment, suite, unit, building, floor, room, hangar, lot, space, or `#` values may be retained.

One provisional organization is created per accepted active license. A provisional physical site and establishment are created only when the reported physical address is in the United States, contains a valid state or territory, street, city, and five-digit ZIP, and is not a P.O. Box. Foreign, incomplete, invalid, and P.O. Box addresses remain organization evidence only. The source provides only one physical address per license even when a business has multiple locations, so it is not a complete storefront inventory.

Business names can identify sole proprietors and reported physical addresses can be residences. Selected source artifacts are internal, normalized records are local-review-only, and aggregate redistribution requires a separate Alaska terms review. Current USPS ZIP validity remains unverified until an authorized operational ZIP denominator is integrated.

## NAICS and identity limits

The NAICS download is joined only by Alaska business license number. Duplicate identical license/NAICS pairs are collapsed; orphan rows, conflicting duplicates, and license-name disagreement fail the build. Source NAICS values are retained as source-reported classifications. No owner, parent-company, network-affiliation, or cross-source identity relationship is inferred.

## Commands

```powershell
npm run ak-business:build
npm run ak-business:verify
```

The build pins both CSV schemas, requires the two downloads to be observed within five minutes, hashes the privacy-minimized source snapshots, checks minimum row and NAICS-coverage floors, quarantines invalid core records, and publishes `current.json` atomically. The verifier independently checks every checksum, field allowlist, privacy exclusion, partition, identity, NAICS join, quarantine record, ZIP aggregate, source-release derivation, and coverage reconciliation.
