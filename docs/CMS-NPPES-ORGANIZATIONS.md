# CMS NPPES organization-provider source

This connector adds a nationwide authorized record layer for health care provider organizations and suppliers. CMS publishes the NPPES full-replacement file monthly at no charge. The current V2 bundle includes the main NPI file plus other-organization-name, non-primary-practice-location, and endpoint reference files.

Official sources:

- [CMS NPI downloadable files](https://download.cms.gov/nppes/NPI_Files.html)
- [CMS data dissemination policy and file semantics](https://www.cms.gov/medicare/regulations-guidance/administrative-simplification/data-dissemination)
- [CMS FOIA-disclosable NPPES elements](https://www.cms.gov/regulations-and-guidance/administrative-simplification/nationalprovidentstand/downloads/nppes_foia_data-elements_062007.pdf)

CMS explicitly cautions that NPI issuance does not validate a provider's license or credentials. Accordingly, this source publishes `npi-active-as-of-source-release` or `npi-reactivated-as-of-source-release` only as NPI enumeration evidence. It never turns those values into a general “open business” status.

## Prepare, build, and verify

```powershell
npm run nppes:prepare
npm run nppes-org:build
npm run nppes-org:verify
```

The source manager:

- allows only the official CMS download hosts;
- validates the CMS monthly V2 release name and ZIP signature;
- recovers a dead PID-owned source lock immediately;
- resumes a deterministic partial archive only after validating HTTP `Content-Range`;
- keeps an incomplete transfer for retry but discards an invalid archive;
- checks free space before download and extraction;
- extracts and hashes the main and three reference CSVs;
- activates the prepared source atomically.

The connector validates those hashes again, creates immutable hard-linked source artifacts inside the release, streams the 10+ GB CSV without loading it into memory, and publishes a manifest and `current.json` pointer only after all quality gates pass.

## Published scope

The public normalized layer contains:

- active or reactivated Entity Type 2 organization NPIs;
- legal business name and typed organization other names;
- reported primary and non-primary U.S. practice locations;
- NPI, organization-subpart flag, source-reported parent name, and healthcare taxonomy codes;
- ZIP/ZCTA geometry status and Census employer-baseline context;
- provider/source dates, provenance, temporal scope, and public export policy.

The public normalized layer excludes active individual Entity Type 1 records, authorized-official fields, EIN/TIN values, mailing addresses, endpoint records, licenses, and other provider identifiers. The immutable raw snapshot is marked internal and cannot flow into public combined exports.

CMS recommends that redistributed deactivated records contain only the NPI and deactivation date because providers cannot update those deactivated records. The connector applies that rule structurally and the verifier rejects any deactivated output containing additional fields.

## Coverage interpretation

`derived/zip-coverage.jsonl` preserves every ZIP in the Census ZBP/ZCTA union and adds any valid U.S. ZIP found in NPPES. Counts distinguish primary from non-primary practice locations. An empty ZIP means “no organization-provider location in this source snapshot,” not “no business.” Current USPS ZIP validity remains unverified until an authoritative denominator is integrated.
