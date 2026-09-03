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
npm run postal-cutover:plan -- --write-plan data/migrations/normalized-us-postal-fields-v1/cutover-plan.json
```

Execution is intentionally verbose and cannot be implied by planning:

```powershell
npm run postal-cutover:execute -- --plan data/migrations/normalized-us-postal-fields-v1/cutover-plan.json --expected-plan-sha256 <sha256> --confirm
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

## Current prepared plan

The 2026-09-03 plan verified all 25 complete candidate artifact sets and binds candidate-readiness hash `8642a111b8362faa4311d56674e112870142c05d9a2ef4b6be8af2681e616dd2`. Its cutover-plan SHA-256 is `505c1039cbd95d7cc3249ca105c9a8e32bc6802b17fa6a7c2173d58fdfc97c1a`. The plan file is local governed state under `data/migrations/normalized-us-postal-fields-v1`; it is ignored by Git and has not been executed.
