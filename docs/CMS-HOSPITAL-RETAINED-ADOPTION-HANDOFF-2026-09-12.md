# CMS hospital retained-source adoption handoff

## Accepted acquisition evidence, not production adoption

The standalone application completed native run `7140acea-6dfb-478e-8769-5dd991bc1875` on September 12, 2026. An independent retained-only invocation of `verifyCmsHospitalAcquisition` succeeded using `DATAHUB_ROOT=C:\Master Data\datahub`, canonical `path.resolve`/`path.join` paths, a 180-second abort deadline, and disabled global fetch. It replayed source-to-selected projection and verified the complete pinned run. No download, retry, registry rebuild or production promotion was performed by this audit.

Main retained directory: `data/business-sources/cms-hospital-general-information/jobs/7140acea-6dfb-478e-8769-5dd991bc1875/`.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| manifest.json | Bound by verifier | `856992891a8ded15d0f924169991cd3c7d0bda6112de1a0702dd5600305e9239` |
| metadata-before.json and metadata-after.json, each | 1,215 | `31eea397b8bfe8207168cefda23256eb9cb3d5e49158d221eda8465a2d8e5f8c` |
| reuse-notice.pdf | 605,761 | `6c45ef1ccb69bd3da4652769254472555bb83a87e8885d6c144e271cb0f53244` |
| source.csv | 1,450,767 | `f874f09fef895a1ccf5bb7392dcbb2be05c9860339261b093fe00f0c1b013480` |
| selected.jsonl | 7,651,883 | `30cb62fac6c3c9a52e9cdba31423a138b65945beb8321cb48f3825f8506bb979` |
| policy.json | 705 | `930855cdc660f33012cfe455bbe33ebcfcd528b53828506d64242c0fe1ec9c87` |

Acquisition/projection timestamps: `2026-09-12T14:02:19.458Z` through `2026-09-12T14:02:20.502Z`; completion is before final publication verification. Dataset `xubh-q36u`; issued `2025-01-08`, modified `2026-07-22`, released `2026-08-13`. Four sequential successful requests, 2,058,958 response bytes, stable before/after metadata. Native CSV has 38 columns; the verifier enforces the ten documented selected headers, not an invented full-header-order contract.

## Independently measured aggregate scope

All 5,419 CSV records are conserved as 5,419 selected records, distinct source-record IDs and distinct publisher facility IDs. Identifier type is `cms-pdc-hospital-facility-id`: 5,255 IDs are six numeric characters and 164 contain letters. Do not coerce to number or constrain to numeric IDs, assert NPI equivalence, or infer globally unique physical campuses/organizations from source uniqueness.

- All 50 states occur: 5,344 records. D.C.: 10. Fifty states plus D.C.: 5,354.
- Territories: 65 records, comprising PR 59, VI 2, GU 2, AS 1 and MP 1. No unknown reported-state values. All accepted source scope: 56 state/DC/territory codes.
- All 5,419 records contain format-valid ZIP5 strings; 352 begin with zero. ZIP4 is null in all 5,419 records. Postal status is `format-only-usps-unverified`, not USPS validation or Census polygon membership.
- NPI, parent company, current operating status, latitude and longitude remain null on every row. No geocoding or polygon assignment occurred. Source hospital type, ownership category and emergency-service strings remain publisher-reported values, not inferred business status.

Reported-state counts (publisher address labels, not point-in-polygon assignments):

```text
AL99 AK25 AZ108 AR90 CA377 CO96 CT36 DE13 DC10 FL221 GA149 HI23
ID48 IL193 IN148 IA118 KS139 KY103 LA161 ME36 MD56 MA84 MI149
MN136 MS109 MO120 MT63 NE93 NV46 NH27 NJ78 NM45 NY192 NC120
ND47 OH193 OK136 OR62 PA186 PR59 RI13 SC66 SD61 TN121 TX467
UT52 VT17 VI2 VA96 WA100 WV55 WI140 WY31 AS1 GU2 MP1
```

These are CMS directory-row counts, not all hospitals, all businesses, active businesses, independently verified sites or collection-completeness percentages. Even though the native row count matches the previously advertised catalog count, no independent database/archive completeness proof has been established. The general CMS reuse notice does not prove absence of all third-party or dataset-specific restrictions. Raw CSV/notice/metadata/policy remain internal; selected records remain local-review-only, with no public export authorization.

## Smallest next retained-only implementation

The acquisition already supplies a typed selected projection. Do not acquire again or reconstruct the source merely to promote it. Add a closed retained selection descriptor (version, app-relative manifest path, exact manifest hash), then a dedicated CMS hospital reporting-input loader that invokes `runner/cms-hospital-acquisition.mjs`'s native verifier and consumes its exact selected artifact with stable bytes/hash and row-membership checks. A small versioned normalization wrapper may map the existing projection to a reporting envelope, but must preserve the source-record ID, publisher identifier string, separate ZIP5/ZIP4, source dates, acquisition observation, policy and all null/false claims. It must reject unknown input versions and fixture-mode input, and never fall back to network.

Use `runner/mn-credential-registry-input.mjs` as an architectural example of additive typed reporting artifacts, not its credential semantics. Its selection/dependency/replay pattern illustrates how to avoid silently routing new records through generic business/site identity reconciliation. Add a separate hospital directory artifact/dependency and strict validator, rather than passing these rows to `reconcileNppesOrganization`, FSIS or EPA reconciliation in `runner/business-registry.mjs`. Those existing handlers assume different identifiers and entity semantics. Any later registry hook must explicitly declare the new artifact, pin its dependency, verify complete membership and policy, and preserve all historical profiles/counts when the option is absent.

Initial output should be independently useful to state/industry reporting: directory rows by reported state and ZIP5, exact all-accepted and 50-states-plus-DC denominators, source cohort share explicitly labeled as such, and null national business completeness. Territory rows must remain accounted for rather than discarded to fit a 51-state display. Do not introduce county geometry from county labels; do not create geometry on business records. Identity matching and verified physical-site counting need a separate reviewed migration, not automatic eligibility from a nonempty address.

## Acceptance required before adoption

1. Offline source replay and exact retained pins above; native versus injected-root separation; wrong hash, path escape, symlink, mutation and unsupported schema reject.
2. Exactly 5,419 conserved records; full unique publisher/source-record membership, not count-only validation. Preserve numeric and alphanumeric six-character IDs and leading-zero ZIPs. Reject duplicate/omitted/extra rows, changed provenance and policy widening.
3. State totals 5,344 + DC10 + territories65 = 5,419; 50-state/DC denominator 5,354, all-source denominator 5,419. Filtered results cannot silently redefine denominators or normalize to 100 percent. Missing future state/ZIP values remain explicit unknowns, not zero or inactive.
4. All ZIP4/geocodes/NPI/company/current-status unknowns remain null; no raw telephone/quality columns appear in reporting output. Raw artifacts stay internal and reporting artifacts local-review-only.
5. Pre/midstream cancellation, immutable manifest-last output, recovery and source drift fail closed; no fetch calls, automatic reacquisition or retry. No production pointer or existing business/site count changes in the helper slice.
6. A later optional registry integration must test absent-option historical compatibility, exact dependency/artifact enrollment, retained replay, export-policy intersection and exclusion from generic identity/business/site counts. Production promotion is a distinct step, not accomplished by this handoff.

An earlier root verifier invocation used a noncanonical slash-form path and rejected before reading. Correcting it with `path.resolve` passed; this was caller-path validation, not a retained source failure.
