# September 7 refresh reconciliation

Observed September 7, 2026. This is the authorized, non-production path for reconciling the refreshed New York retail-food, California ABC, and Washington L&I releases with the corrected normalized-US-postal candidate cohort. It does not promote a production source, registry, resolution, benchmark, or coverage pointer.

## Readiness decision

The production postal cohort is not ready: `npm run postal-migration:status` reports 0/25 sources ready because every production source pointer predates its corrected connector floor. The isolated candidate cohort is ready: `npm run postal-migration:candidates` reports 25/25 ready with frozen-plan SHA-256 `8fa892b1c3448c9e6e0f69ee7cc4be67575339159667ce9a4e15d76751d576c3`.

The candidate pointers for the three refreshed sources still select September 3 releases. The September 7 releases are:

| Source key | Candidate release selected today | Refreshed release to reconcile |
| --- | --- | --- |
| `nyRetailFoodStores` | `ny-retail-food-stores-20260903-002237542Z-3dba4d86` | `ny-retail-food-stores-20260907-134303353Z-c3167a89` |
| `caAbcActiveLicenses` | `ca-abc-active-licenses-20260903-003718516Z-02d9b3f8` | `ca-abc-active-licenses-20260907-134420041Z-1d86412e` |
| `waLniActiveContractors` | `wa-lni-active-contractor-licenses-20260903-005145167Z-b5c66203` | `wa-lni-active-contractor-licenses-20260907-135045275Z-4c8b3283` |

All three refreshed releases pass their independent artifact verifiers. A postal inspection using the 22 candidate pointers and these three explicit overrides reports 25/25 ready, zero rebuild-required, zero blocked, and frozen-plan SHA-256 `df6338fa0ec70a604f4cc32e940e50427f186f910806a3587a92328194d86716`. Therefore no source-quality or postal-contract blocker prevents a new isolated downstream build.

Washington remains organization and mailing-address evidence only. Its release must not create physical sites or establishments. California retains 2,002 other-state premises under the California publisher bucket, and New York retains its annual source release date; neither fact may be rewritten as state-only business coverage or independently observed operation.

## Exact isolated build

Run from the repository root. The PowerShell argument list makes every registry input explicit: 22 inputs come from the corrected postal candidate tree and the three refreshed inputs override their older candidates. Outputs remain under the migration `downstream` tree.

```powershell
$candidateRoot = 'data/migrations/normalized-us-postal-fields-v1'
$registryArgs = @(
  '--output', "$candidateRoot/downstream/business-registry",
  '--fsis', "$candidateRoot/sources/fsis/current.json",
  '--ny-retail-food', 'data/industry-refresh/retail-consumer/NY/ny-retail-food-stores/current.json',
  '--fdic', "$candidateRoot/sources/fdic/current.json",
  '--de-business', "$candidateRoot/sources/deBusiness/current.json",
  '--echo', "$candidateRoot/sources/echo/current.json",
  '--fmcsa', "$candidateRoot/sources/fmcsa/current.json",
  '--co-business', "$candidateRoot/sources/coBusiness/current.json",
  '--irs-eo', "$candidateRoot/sources/irsEo/current.json",
  '--ak-business', "$candidateRoot/sources/akBusiness/current.json",
  '--ca-abc', 'data/industry-refresh/retail-consumer/CA/ca-abc-active-license-sites/current.json',
  '--chicago-licenses', "$candidateRoot/sources/chicagoActiveBusinessLicenses/current.json",
  '--ct-business', "$candidateRoot/sources/ctBusiness/current.json",
  '--dc-licenses', "$candidateRoot/sources/dcBasicBusinessLicenses/current.json",
  '--ia-business', "$candidateRoot/sources/iaBusiness/current.json",
  '--la-active-businesses', "$candidateRoot/sources/laActiveBusinesses/current.json",
  '--ncua', "$candidateRoot/sources/ncua/current.json",
  '--nyc-dcwp', "$candidateRoot/sources/nycDcwpActiveLicenses/current.json",
  '--or-business', "$candidateRoot/sources/orBusiness/current.json",
  '--snap', "$candidateRoot/sources/snap/current.json",
  '--tx-sales-tax', "$candidateRoot/sources/txActiveSalesTax/current.json",
  '--wa-lni-contractors', 'data/industry-segments/runs/construction-wa-20260907-standalone/state-wa-contractors-WA/current.json',
  '--ny-business', "$candidateRoot/sources/nyBusiness/current.json",
  '--pa-business', "$candidateRoot/sources/paBusiness/current.json",
  '--nppes', "$candidateRoot/sources/nppes/current.json",
  '--fl-business', "$candidateRoot/sources/flBusiness/current.json"
)

node scripts/check-normalized-us-postal-migration.mjs --candidates `
  --pointer nyRetailFoodStores=data/industry-refresh/retail-consumer/NY/ny-retail-food-stores/current.json `
  --pointer caAbcActiveLicenses=data/industry-refresh/retail-consumer/CA/ca-abc-active-license-sites/current.json `
  --pointer waLniActiveContractors=data/industry-segments/runs/construction-wa-20260907-standalone/state-wa-contractors-WA/current.json

node scripts/build-business-registry.mjs @registryArgs
node scripts/verify-business-registry.mjs "$candidateRoot/downstream/business-registry/current.json"

node scripts/build-business-entity-resolution.mjs `
  --registry "$candidateRoot/downstream/business-registry/current.json" `
  --output "$candidateRoot/downstream/entity-resolution"
node scripts/verify-business-entity-resolution.mjs "$candidateRoot/downstream/entity-resolution/current.json"

node scripts/build-entity-resolution-benchmark.mjs `
  --registry "$candidateRoot/downstream/business-registry/current.json" `
  --resolution "$candidateRoot/downstream/entity-resolution/current.json" `
  --output "$candidateRoot/downstream/benchmark"
node scripts/verify-entity-resolution-benchmark.mjs "$candidateRoot/downstream/benchmark/current.json"

node scripts/build-national-business-coverage-views.mjs `
  --registry "$candidateRoot/downstream/business-registry/current.json" `
  --resolution "$candidateRoot/downstream/entity-resolution/current.json" `
  --benchmark "$candidateRoot/downstream/benchmark/current.json" `
  --geography data/geography/current.json `
  --crosswalk data/zcta-jurisdiction-crosswalk/current.json `
  --nonemployer data/business-baselines/census-nonemployer/current.json `
  --output "$candidateRoot/downstream/business-coverage-views"
node scripts/verify-national-business-coverage-views.mjs "$candidateRoot/downstream/business-coverage-views/current.json"
```

Do not skip the benchmark rebuild. Coverage pins registry, resolution, and benchmark releases, so reusing the September 3 benchmark would make the chain internally stale even if a verifier happened to accept it.

## Reconciliation acceptance evidence

Before considering the isolated chain ready for cutover preparation, record the four newly emitted release IDs and require all of the following:

1. Every verifier above exits zero.
2. The new registry manifest pins exactly the three refreshed release IDs in the table above and continues to pin the other 22 corrected candidates.
3. Registry coverage for New York, California, and Washington reconciles to the verified source counts in `docs/INDUSTRY-REFRESH-2026-09-07.md`; Washington site and establishment counts remain null/absent rather than inferred.
4. Resolution and benchmark manifests pin the new registry release, and coverage pins the new registry, resolution, and benchmark releases.
5. Production `data/business-registry/current.json`, `data/business-entity-resolution/current.json`, `data/business-entity-resolution-benchmark/current.json`, and `data/business-coverage-views/current.json` remain byte-for-byte unchanged during this isolated build.
6. `npm run check` and `npm audit --omit=dev` pass before any production promotion.

## Promotion blocker and next cutover step

The existing postal cutover planner cannot promote this mixed cohort as-is. Its plan requires every selected source to have `pointer_scope: candidate`; the readiness report above classifies the three September 7 pointers as `override`, and the current September 3 cutover plan is hash-pinned to the older releases. Executing that old plan would intentionally promote the September 3 source set, not the refreshed set.

After the isolated national chain verifies, publish or rebuild each of the three September 7 releases into its corresponding governed migration candidate root, using the connector's normal immutable publication path rather than hand-editing a pointer:

```text
data/migrations/normalized-us-postal-fields-v1/sources/nyRetailFoodStores/current.json
data/migrations/normalized-us-postal-fields-v1/sources/caAbcActiveLicenses/current.json
data/migrations/normalized-us-postal-fields-v1/sources/waLniActiveContractors/current.json
```

Then rerun `npm run postal-migration:candidates`, require 25 candidate-scoped ready sources and the three September 7 release IDs, and create a new cutover plan at a new path:

```powershell
node scripts/cutover-normalized-us-postal-migration.mjs plan `
  --write-plan data/migrations/normalized-us-postal-fields-v1/cutover-plan-20260907-refresh.json
```

Review and retain the emitted plan SHA-256. Only that newly reviewed hash may be supplied to `execute --confirm`. Source cutover and production downstream publication are separate operations: after a successful source cutover, rebuild and verify registry, resolution, benchmark, and coverage in that order against production pointers. Do not repoint production to the isolated `downstream` artifacts.

Rollback before cutover is file-local: retain the prior isolated `current.json` values and restore them only through the repository's governed publication/recovery mechanism if an isolated build fails. Once cutover execution starts, use its journaled `status`, `recover`, or `rollback` commands with the exact cutover ID and reviewed plan hash; do not manually repair production pointers.
