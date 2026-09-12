# Nationwide source alignment — 2026-09-12

## Finding

EPA ECHO and USDA FSIS are already retained and included in the production plan `production-mn-credentials-20260910-01`. The current six-source dataset-representation denominator omits them because it reads `config/industry-segments.json`, a runnable acquisition plan, rather than a complete reporting-source catalog. This is a reporting/enrollment gap, not a reason to download either source again.

The integrator reread both manifests and verified their SHA-256 values below. A parallel source reviewer checked the small current coverage state/source views. This review did not replay every business record, run a build, dispatch acquisition, or change production pointers.

| Contract | EPA ECHO | USDA FSIS |
| --- | --- | --- |
| Dataset | `epa-echo-active-facilities` | `fsis-active-mpi-establishments` |
| Coverage source key | `epa_echo_active_facilities` | `fsis_active_mpi_establishments` |
| Location profile | `epa-echo-exporter-active-facility` | `usda-fsis-active-mpi-directory` |
| Retained release | `epa-echo-20260903-002418917Z-3c1270e9` | `fsis-mpi-20260903-002210046Z-c0d4d058` |
| Manifest SHA-256 | `3de9a8d9c54006d8983581105cd7e51e8e719291b3731d78e911c65b262625fa` | `6c68d892010cf114866121e6ea5adc2e3dc1f21784b350344590032b4562858d` |
| Accepted source profiles, including territories | 1,517,826 | 7,237 |
| Reviewer-reported 50-state + D.C. subtotal | 1,512,971 | 7,118 |

Each manifest resides at `data/business-sources/<dataset>/releases/<release>/manifest.json`. Current coverage is `national-business-coverage-views-20260911-040908332Z-f01c882a`; its `views/states.jsonl` and `views/sources.jsonl` already contain the corresponding evidence. State-record counts are source profiles, not unique reconciled businesses.

## Required reporting alignment

1. Give retained reporting sources explicit profile/source mappings and descriptive source scopes. ECHO is environmentally regulated facilities; FSIS is regulated meat, poultry and egg-product establishments. Neither is a census of an entire industry or all businesses.
2. Separate reporting enrollment from executable acquisition enrollment. Do not simply add their current scripts to default industry runs: ECHO downloads when `--archive` is absent; FSIS requires an explicit `--source-date` and prepared source inputs. A manual-selection flag alone does not make explicit execution safe.
3. Prefer a reporting-only catalog or a tested retained-release adapter. Bind displayed evidence to the selected verified coverage release; preserve unavailable state evidence as null and measured zero as zero. Show the denominator's scope/version and distinguish source presence from business completeness.
4. No acquisition, source refresh, new permissions, production rebuild or pointer change is needed merely to display the existing coverage. A later refresh is a separate app-owned operation with its own prerequisites and authorization.
5. Keep the existing six-source metric's limitations visible until alignment is implemented. Do not silently change its denominator while a UI-only release is under verification.

## Semantics that must survive integration

- ECHO's `FAC_ACTIVE_FLAG=Y` means an associated environmental program is active, not independently verified business operation. Source coordinates can describe centroids. Current location-profile coverage does not establish usable address geocodes; do not manufacture latitude/longitude from source availability alone.
- FSIS evidence is active-directory membership dated 2026-08-24, not independent proof of current operations. DUNS remains excluded from normalized/public records.
- Preserve combined coverage's `local-review-only` restriction. Individual source-field allowances do not override the combined release policy.
- Business records retain points only, when supported; no business polygons. ZIP5 and ZIP4 remain separate.

## Coding handoff

The existing **Spark — Co*Tive Coding and Testing** agent owns implementation and tests after the current JSON-download/font/coverage fixes are verified. Acceptance requires ECHO/FSIS evidence from the retained release, correct null/zero behavior, honest denominator labels, and proof that reporting enrollment does not enable downloads or alter production pins. This document is not evidence that that implementation is complete.

The separate Maine provider preflight remains unfinished; its updated [contract observations](states/ME-MEDICAL-PROVIDER-CONTRACT-2026-09-12.md) specify the next exact export step without repeating prior probes. Overture remains a distinct new acquisition requiring fresh approval under the [existing limits](COLLECTION-NEXT-ACTIONS-2026-09-12.md).
