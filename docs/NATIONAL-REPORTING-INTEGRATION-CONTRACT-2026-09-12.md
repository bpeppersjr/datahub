# National reporting integration contract — 2026-09-12

Status: reviewed implementation contract, not implemented behavior. This slice displays already-retained production evidence; it authorizes no acquisition, refresh, production rebuild, pointer change, or broader export.

## Reporting catalog, separate from acquisition

Introduce a closed, versioned `config/national-reporting-sources.json`. It must contain reporting mappings and limitations, not scripts, executable arguments or acquisition capability. Leave `config/industry-segments.json` unchanged: directly enrolling the ECHO builder would download without `--archive`, while FSIS requires explicit prepared inputs and `--source-date`.

The new catalog contains the existing six reporting mappings plus two retained sources:

| Reporting source | Location-profile ID | Coverage source key |
| --- | --- | --- |
| USDA SNAP | `usda-snap-current-retailers` | `usda_snap_retailers` |
| CMS NPPES | `cms-nppes-monthly-v2` | `cms_nppes_organizations` |
| FDIC BankFind | `fdic-bankfind-current-structure` | `fdic_bankfind` |
| NCUA | `ncua-final-quarterly-call-report` | `ncua_quarterly_credit_unions` |
| FMCSA | `fmcsa-company-census-active-us-principal-office` | `fmcsa_active_us_company_census` |
| IRS EO BMF | None: use the existing independently bound filing-address summary | `irs_eo_bmf_organizations` |
| EPA ECHO | `epa-echo-exporter-active-facility` | `epa_echo_active_facilities` |
| USDA FSIS | `usda-fsis-active-mpi-directory` | `fsis_active_mpi_establishments` |

ECHO is a cross-industry regulated-facility source, not a single industry census. Give it an explicit cross-industry reporting group rather than inventing an industry assignment. FSIS grouping describes regulated meat, poultry and egg-product establishments, not all food businesses. Catalog validation rejects duplicate mappings, unknown keys, malformed groups and executable fields.

## Explicit six-to-eight denominator migration

The existing measure is the six configured nationwide acquisition datasets. The new measure is eight enrolled national reporting datasets. Give the new denominator an explicit catalog/schema version and scope label. Do not silently rewrite historical six-source results or retain their old collection-plan label while changing the denominator.

For each state, the numerator counts enrolled datasets with a measured positive state-record count. The denominator includes every enrolled dataset, including unavailable ones. Measured zero means no state records in that evidence; missing evidence remains null. If every dataset is unmeasured, the percentage remains null. Empty groups must not produce NaN or a misleading zero-percent completeness claim.

Keep `allBusinessesPercent: null` even when dataset presence reaches 100%. Display source-wide state record counts as source profiles or IRS filing-address records, never reconciled unique businesses, physical sites or industry completeness. Record counts are not summed into a purported national business total. State-only sources remain outside this national dataset denominator; territories and the 50-state-plus-D.C. display scope remain explicit.

## Retained evidence and policy boundaries

The reviewed evidence roster is documented in `docs/NATIONAL-SOURCE-ALIGNMENT-2026-09-12.md`. ECHO release `epa-echo-20260903-002418917Z-3c1270e9` has manifest SHA-256 `3de9a8d9c54006d8983581105cd7e51e8e719291b3731d78e911c65b262625fa`; FSIS release `fsis-mpi-20260903-002210046Z-c0d4d058` has manifest SHA-256 `6c68d892010cf114866121e6ea5adc2e3dc1f21784b350344590032b4562858d`. Manifests reside under `data/business-sources/<dataset>/releases/<release>/manifest.json`, with datasets `epa-echo-active-facilities` and `fsis-active-mpi-establishments` respectively.

Their already-published source profiles total 1,517,826 and 7,237 including territories; reviewed 50-state-plus-D.C. subtotals are 1,512,971 and 7,118. These are source-profile counts, not unique businesses. Production coverage `national-business-coverage-views-20260911-040908332Z-f01c882a` already contains their state/source evidence. This document records prior bounded review, not a new full-record replay.

Bind each response to one selected coverage manifest and its state/source artifacts. Match source release metadata to the selected coverage evidence, not an independently changing source-current pointer. Return provenance sufficient to identify catalog version, coverage release and artifact hashes; report `sourceReplayPerformedThisRead: false` when only the aggregate artifacts were verified.

- ECHO `FAC_ACTIVE_FLAG=Y` denotes activity in an associated environmental program, not independently verified business operation. Current location-profile coverage does not establish usable address geocodes; do not infer coordinates from raw source availability.
- FSIS active-directory membership is dated 2026-08-24 evidence, not independent current-operation verification. DUNS stays excluded.
- Preserve combined coverage's `local-review-only` restriction. Individual source field allowances cannot loosen a combined release restriction.
- No raw business records are required for this view. ZIP5 and ZIP4 remain separate; no business polygons are added.

## Existing integrity gap to close

`runner/business-coverage-view-store.mjs` currently caches `ensureRelease()` by release ID. `safeArtifactPath()` supplies lexical containment, and `getDatasetRepresentation()` then reads state/source JSONL without checking the declared byte counts and SHA-256 hashes. Therefore the current path/cache mechanism alone is not verified snapshot binding.

For this reporting projection, use bounded, non-symlink, stable reads of the selected manifest and small state/source artifacts; validate declared bytes and hashes, reject duplicate artifact types, and check the selected pointer remains consistent across the read. Handle same-ID mutations and replacement as invalid evidence rather than serving stale cached data. Avoid expanding this slice into a whole-store redesign or replaying large business records.

## Implementation files

1. New catalog and a small reusable catalog/snapshot validator as needed.
2. `runner/dataset-representation.mjs`: projection from the validated reporting catalog, denominator version/scope and source-specific units/limitations.
3. `runner/business-coverage-view-store.mjs`: selected-snapshot integrity checks and reporting-catalog input, retaining the IRS summary's separate evidence contract.
4. `app/dataset-representation.tsx`: replace collection-plan wording with enrolled national reporting datasets; show denominator version, provenance scope and unknown all-business completeness.
5. Focused catalog/projection/store tests and update the alignment document after verified completion.

## Required acceptance tests

1. New catalog yields exactly eight expected sources and the correct ECHO/FSIS profile/source mappings. Legacy six-source semantics remain distinguishable by scope/version; no silent historical relabeling.
2. Missing, zero and positive state counts remain distinct. Reject invalid/negative/nonintegral counts; unknown mappings cannot manufacture represented status. Empty groups remain unmeasured.
3. IRS filing-address evidence stays separate from location profiles. ECHO/FSIS rows retain source-specific scope, date/unknown semantics and units.
4. A 100% dataset-presence result still has unknown all-business completeness. UI labels cannot imply all establishments in an industry were collected.
5. Reject hash/byte mismatch, symlink escape, duplicate artifact descriptors, mixed source/state releases, pointer drift and same-release-ID artifact mutation. Unavailable evidence is not converted to measured zero.
6. Preserve `local-review-only` restrictions and absence of raw records, DUNS, inferred geocodes and joined ZIP+4.
7. Projection succeeds with network disabled using small offline fixtures or a bounded retained aggregate read. No acquisition builder is invoked.
8. Assert executable acquisition configuration/plans and production/source pointers remain unchanged. No schedules, refreshes, source requests or normalized rebuilds are needed.

The implementation agent should hand back focused test evidence and truthful remaining limitations. Root owns integration and full repository/runtime verification.
