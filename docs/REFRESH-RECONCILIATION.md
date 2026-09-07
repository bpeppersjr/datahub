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

Preparing immutable, byte-identical copies of the three refreshed releases under their migration candidate roots may run concurrently with this isolated downstream build. That preparation does not change the manifests already resolved by the live registry process, does not substitute candidate-readiness for downstream verification, and does not authorize cutover. The complete registry, resolution, benchmark, and coverage chain must still finish and pass its verifiers against the recorded release IDs.

## Candidate import outcome and next cutover step

At isolated-build launch, the postal cutover planner could not promote the mixed cohort as-is. Its plan requires every selected source to have `pointer_scope: candidate`; the launch readiness report classified the three September 7 pointers as `override`, and the September 3 cutover plan was hash-pinned to the older releases. Executing that old plan would intentionally promote the September 3 source set, not the refreshed set.

That candidate-scope blocker is now resolved. During the isolated build, all three refreshed releases were imported as immutable, verified candidate copies under their corresponding governed migration roots:

```text
data/migrations/normalized-us-postal-fields-v1/sources/nyRetailFoodStores/current.json
data/migrations/normalized-us-postal-fields-v1/sources/caAbcActiveLicenses/current.json
data/migrations/normalized-us-postal-fields-v1/sources/waLniActiveContractors/current.json
```

The import preserved the exact refreshed release IDs, replayed all three independent source verifiers across 50 artifacts, and left all 29 captured production pointer hashes unchanged. The strict candidate gate now reports 25/25 candidate-scoped sources ready, zero blocked, with frozen-plan SHA-256 `28c94c799bf9faf21875180d576b2bc89c278574ad94a08a97cfd8a03b5b6f49`. Machine-readable evidence is recorded in `docs/INDUSTRY-CANDIDATE-IMPORT-EVIDENCE-2026-09-07.json`.

The isolated registry, resolution, benchmark, and coverage chain has now finished and verified, as recorded below. On September 7, a new plan was prepared successfully using:

```powershell
node scripts/cutover-normalized-us-postal-migration.mjs plan `
  --write-plan data/migrations/normalized-us-postal-fields-v1/cutover-plan-20260907-refresh.json
```

The prepared plan SHA-256 is `6cb1a6a92f4a30ca8ae81f876b71a31f0dfaeaa633d28ec044cdd726b0d8f984`. Planning reverified all 25 source releases, 539 artifacts, and 18,769,197,611 bytes. An independent review recomputed the plan hash and checked 75 current pointer/manifest hashes; the 25 production source pointers were unchanged at planning time. The user subsequently approved execution, which committed successfully as documented in [the cutover receipt](NORMALIZED-US-POSTAL-CUTOVER.md#september-7-execution--committed). Do not rerun this completed plan or execute an older plan.

Only that newly reviewed hash may be supplied to `execute --confirm` after confirmation. Source cutover and production downstream publication are separate operations: after a successful source cutover, rebuild and verify registry, resolution, benchmark, and coverage in that order against production pointers. Do not repoint production to the isolated `downstream` artifacts. The benchmark's absent independent labels continue to block approval of entity-resolution-based aggregate deduplication, not the integrity of the source releases.

Rollback before cutover is file-local: retain the prior isolated `current.json` values and restore them only through the repository's governed publication/recovery mechanism if an isolated build fails. Once cutover execution starts, use its journaled `status`, `recover`, or `rollback` commands with the exact cutover ID and reviewed plan hash; do not manually repair production pointers.

## Live isolated-chain evidence

The exact mixed-input readiness gate passed immediately before launch with 25/25 sources ready, zero blocked, and frozen input SHA-256 `df6338fa0ec70a604f4cc32e940e50427f186f910806a3587a92328194d86716`.

The isolated registry published as `national-business-registry-20260907-140848014Z-9b1fdcb8`, and its independent verifier exited zero across 679 artifacts. Verified source-preserving totals are 33,979,462 source records, 19,247,102 organization records, 8,011,817 physical-site records, 8,011,817 establishment records, 191,205,139 assertions, and a 48,190-ZIP union with record-level contributions in 47,991 ZIPs. These are overlapping source records and provisional canonical candidates, not a count of unique U.S. businesses or proof of national completeness.

The verified refreshed-source contributions are:

| Source | Verified registry contribution |
| --- | --- |
| Washington L&I | 75,816 active license rows; 72,819 organizations; 74,030 eligible reported U.S. mailing addresses; no inferred physical-site contribution |
| California ABC | 105,672 selected active issued-license rows; 84,497 organizations/sites; 105,435 license activities; 237 quarantined source rows |
| New York retail food | 24,281 license organizations; 24,230 provisional physical sites; 22,999 usable platform geocodes; zero quarantined source rows |

The dependent entity-resolution release subsequently published and independently verified as `business-entity-resolution-20260907-152358811Z-5d44a98c` across 101 artifacts. It pins the verified registry release and reports 8,011,817 profiles, 6,505,544 address groups, 2,325,194 site-alias decisions, 146,896 establishment-alias decisions, 106,063 review-candidate decisions, and two review groups skipped for size. These are deterministic decision-layer counts, not adjudicated unique-business totals.

The benchmark then published and independently verified as `business-entity-resolution-benchmark-sample-20260907-152723285Z-cecd9819` across three artifacts. It contains 1,275 sampled candidates—425 in each of the automatic-physical-site, automatic-establishment, and review-candidate strata—and 2,545 unique profiles in its review packet. Its truthful status remains `awaiting-independent-labels`: submitted labels are zero and `benchmark_gate_passed` is false. Verification proves artifact and sampling integrity, not entity-resolution accuracy.

Finally, coverage published and independently verified as `national-business-coverage-views-20260907-152810395Z-065d78dd` across seven artifacts totaling 587,635,246 verified bytes. It pins the new registry, resolution, and benchmark chain and reports three national views, 56 state/equivalent views, 3,235 county/equivalent views, 48,190 ZIP views, 26 source views, and 28,073 explicit gap records. Of 8,011,817 location profiles assessed, 995,292 have coordinate assignments and 7,016,525 do not. The release preserves the incomplete-business-universe and entity-resolution-not-approved-for-aggregate-application gaps; it does not claim national completeness or approved deduplication.

The isolated four-stage chain completed with exit code zero. No production registry, resolution, benchmark, coverage, or source pointer was promoted by this run.

Following explicit user approval, the separate source cutover committed all 25 source pointers at `2026-09-07T15:37:25.750Z`. That later transaction retained verified pointer backups and did not repoint production downstream artifacts to this isolated tree. The production rebuild uses the promoted source pointers and must independently verify its own outputs.
