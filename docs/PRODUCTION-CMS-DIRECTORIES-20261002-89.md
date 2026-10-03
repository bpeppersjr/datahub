# Proposed additive CMS directory production — October 2, 2026

Plan 89 is the current clean-repository successor after committing the governed ZIP-by-source native-status distribution, bounded reader, inspector integration, and accessible UI.

- Run ID: `production-cms-directories-20261002-89`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-89.json`
- Exact confirmation SHA-256: `3aea0db618d8ddce07f74ef8c560a4da6952aa22a697e7886a884fb5573759bd`
- Plan file SHA-256: `a8714387146adfcb604f0b29043f6e3e260f4b5a5dfe5456aeffcef668056f4e`
- Planning repository commit: `2be0629`
- Created: `2026-10-03T00:34:30.015Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The registered ZIP source-native-status derivative is metadata-only and is not enrolled as a production action. Its content-addressed release is `zip-source-native-status-f6ae96364838baab402d8bcd487cac04059f910af1b71bb9da6bf19424d50640`, with manifest SHA-256 `0d244bf8622d83089153c142837b9078db049d7b521c34bf76471831cedfb338`. It conserves 8,011,835 registry location profiles across 15 sources and 232,092 opaque ZIP/source/status groups in 100 data shards plus 100 positional indexes. It publishes no current pointer and performs no source acquisition.

The ZIP inspector now reports source-native status distributions in the same bounded response as other ZIP evidence. Missing, null, empty, and present status payloads remain distinct. Present values are opaque hashes and never leave the API as raw status text; no record identifiers are exposed. Counts are registry location profiles, not unique businesses, physical sites, establishments, current operations, USPS-valid ZIPs, ZCTA membership, or completeness. Source statuses are not combined into a universal active/inactive classification.

The publisher and verifier use bounded spill-to-disk conservation for global identity and status aggregation. Embedded and separately invoked full verification reproduced all 8,011,835 profiles and matched all 15 source totals and canonical distribution digests from `business-temporal-conservation-audit@1.0.0`. Runtime validates the complete 100-data plus 100-index artifact roster, source/release conservation, claims, registration identity, and selected byte range before returning evidence.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 230,428,327,936 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Independent review closed all findings. The adversarial suite covers spill-backed conservation, duplicate identities, lineage and policy drift, resource bounds, cancellation cleanup, artifact/conservation/index/range tampering, and failed publication cleanup. The full repository test gate ran 3,001 tests: 2,926 passed, 75 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, 200% keyboard UI acceptance, and production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 88 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, CMS production execution, or production pointer change occurred while preparing Plan 89.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-89 --expected-plan-sha256 3aea0db618d8ddce07f74ef8c560a4da6952aa22a697e7886a884fb5573759bd
```
