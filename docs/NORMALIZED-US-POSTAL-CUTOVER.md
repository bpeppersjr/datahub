# Normalized U.S. postal migration cutover

The split ZIP5/ZIP4 migration uses isolated source candidates until every governed source is ready. Promotion is a separate operator-confirmed transaction; building a candidate never changes a production pointer.

## Safety contract

A cutover plan is valid only when all 25 sources resolve to isolated candidate pointers, every release satisfies its connector-version floor, every manifest artifact has its declared byte count and SHA-256, and no unlisted file or link exists in a candidate release. Published source connectors use three established manifest conventions: `status: "published"`, `status: "complete"`, or an omitted status with publication represented by the verified current pointer. Any explicit status outside the two completed values is rejected. The frozen plan binds the migration definition, connector configurations, production pointers, candidate pointers, manifests, artifact receipts, release IDs, and destination paths.

Execution requires the exact plan SHA-256 and explicit confirmation. It:

1. acquires one exclusive migration lock;
2. rechecks all frozen candidate and production hashes;
3. copies and re-verifies immutable candidate release directories under their production source roots;
4. stores byte-exact production pointer backups in a run-scoped journal;
5. rechecks compare-and-swap inputs immediately before promotion;
6. atomically replaces each `current.json` and verifies its resulting hash;
7. verifies that all production pointers now satisfy the migration; and
8. records a terminal `COMMITTED` state before releasing the lock.

An ordinary failure automatically restores every pointer still matching the planned candidate hash. A process interruption leaves the lock and durable journal for explicit recovery. Recovery and rollback refuse to overwrite any pointer whose bytes match neither the frozen original nor the frozen candidate. Copied immutable releases are retained; rollback changes pointers only.

Registry 2.10.0 is separately blocked while the cutover lock exists and remains blocked until all production pointers satisfy the postal migration.

## Commands

Planning is read-only except for exclusive creation of the requested plan file:

```powershell
npm run postal-cutover:plan -- --write-plan data/migrations/normalized-us-postal-fields-v1/cutover-plan-<new-unique-id>.json
```

Execution is intentionally verbose and cannot be implied by planning:

```powershell
npm run postal-cutover:execute -- --plan data/migrations/normalized-us-postal-fields-v1/cutover-plan-20260907-refresh.json --expected-plan-sha256 <reviewed-sha256> --confirm
```

Inspect or recover one durable run using the cutover ID printed by execution:

```powershell
npm run postal-cutover:status -- --cutover-id <cutover-id>
npm run postal-cutover:recover -- --cutover-id <cutover-id> --expected-plan-sha256 <sha256> --confirm
```

A committed cutover can be rolled back only while every promoted pointer still has the frozen candidate hash:

```powershell
npm run postal-cutover:rollback -- --cutover-id <cutover-id> --expected-plan-sha256 <sha256> --confirm
```

No command deletes an immutable candidate or production release.

## Historical September 3 plan (superseded)

The refreshed 2026-09-03 plan reverified all 25 complete candidate releases: 539 declared artifacts totaling 18,769,192,318 bytes. It binds live production-readiness hash `c7028b4aebf3d77b9f43c9d8357b79ff83fc224a12cbc9bb6aa4dfcc33bafdce` and candidate-readiness hash `8fa892b1c3448c9e6e0f69ee7cc4be67575339159667ce9a4e15d76751d576c3`; its canonical cutover-plan SHA-256 is `62aae9436c0a91b8d930caa766f1b7b6603916612fa4bf82e432e61680ef4d79`. The older `cutover-plan.json` is retained as audit history but is stale and must not be executed. The first isolated registry 2.10.0 chain is retained as a failed split-field audit receipt. Its corrected registry 2.11.0, entity-resolution, benchmark, and national-coverage replacements now pass their independent verifiers, and strict ZIP audit `zip-denominator-audit-91f2251924768ac8d4c94bc2` reports zero physical split-field or missing-reason violations. The benchmark has no independent labels and does not pass its statistical quality gate, so cutover remains an operator decision rather than an automatic consequence of technical readiness. The refreshed plan file is local governed state under `data/migrations/normalized-us-postal-fields-v1`; it is ignored by Git and has not been executed. Production remains at 0 of 25 promoted source pointers.

## September 7 reviewed plan

After the refreshed isolated registry, resolution, benchmark sample, and coverage chain all independently verified, planning completed with exit zero at `data/migrations/normalized-us-postal-fields-v1/cutover-plan-20260907-refresh.json`. It reverified 25 sources, 539 artifacts, and 18,769,197,611 bytes, including the September 7 NY retail-food, CA ABC, and WA contractor releases. Its canonical plan SHA-256 is `6cb1a6a92f4a30ca8ae81f876b71a31f0dfaeaa633d28ec044cdd726b0d8f984`; candidate readiness is `28c94c799bf9faf21875180d576b2bc89c278574ad94a08a97cfd8a03b5b6f49`. The production-readiness hash remains `c7028b4aebf3d77b9f43c9d8357b79ff83fc224a12cbc9bb6aa4dfcc33bafdce`. A separate comparison found zero drift in all 25 production pointer hashes.

Read-only ZIP audit `zip-denominator-audit-a1337a1e172d760054a51d27` physically checked all 48,190 aggregate ZIP rows in the new registry: zero missing, joined, mismatched, or non-null split-field violations and zero missing reasons for unverified USPS status. Census ZCTA membership remains distinct from current USPS operational validity.

This plan supersedes both older plans for the intended refreshed cohort. Its subsequent approved execution is recorded below. Source promotion does not approve statistical deduplication: the benchmark has zero independent labels, its accuracy gate remains false, and aggregate application must stay disabled. Production downstream publication requires a separate rebuild and verification against the promoted source pointers. See [complete isolated-chain evidence](REFRESH-RECONCILIATION.md).

## September 7 execution — COMMITTED

The user explicitly approved promotion and the production rebuild. Execution of the reviewed hash completed with exit zero at `2026-09-07T15:37:25.750Z`: cutover ID `20260907153645547-16d08121-7703-4d69-bcfc-9e75a5a36ffa`, status `COMMITTED`, state revision 53. All 25 immutable source releases were prepared and reverified before their production pointers were promoted. No source download was performed.

Independent post-execution checks found all 25 production pointers byte-identical to their planned candidate pointers and all 25 journal backups byte-identical to the previous production pointers. Both mismatch counts were zero; the migration lock was released. Production readiness is now 25/25, with zero blocked or rebuild-required sources, zero candidate-pointer substitutions, and readiness hash `84738a309d340703420bd42ab56aefec583a34cb855ac83fcf42e08e0134a848`.

Rollback evidence is retained under `data/migrations/normalized-us-postal-fields-v1/cutovers/20260907153645547-16d08121-7703-4d69-bcfc-9e75a5a36ffa/`. If rollback becomes necessary, use the guarded rollback command with this cutover ID and reviewed plan hash; do not manually replace pointers. Immutable prior and promoted releases remain retained. This source transaction did not replace production registry, resolution, benchmark, or coverage pointers; the separate downstream rebuild is the next operation.
