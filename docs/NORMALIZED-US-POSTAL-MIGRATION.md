# Normalized U.S. postal-field migration

Registry publisher 2.10.0 requires each normalized U.S. address to keep the five-digit ZIP and optional four-digit routing extension in separate fields. Existing immutable releases are preserved. They are never edited in place.

## Readiness gate

Run the read-only status command before any registry rebuild:

```powershell
npm run postal-migration:status
```

The command reads the 25 governed source pointers, their exact release manifests, and the connector configurations. It reports the current release version, the required correction floor, the build and verification commands, missing rebuild prerequisites, and a deterministic frozen-plan SHA-256. It does not run a connector, contact a provider, change a pointer, or print credential values.

`npm run postal-migration:check` uses the same inspection but exits unsuccessfully until every current source release satisfies the migration floor. `npm run registry:build` runs that assertion before loading source artifacts or creating registry staging files, so registry 2.10.0 cannot accidentally depend on a mixed or legacy source set.

`npm run postal-migration:candidates` prefers a source's isolated pointer under `data/migrations/normalized-us-postal-fields-v1/sources/<source-key>/current.json` when it exists and otherwise falls back to the unchanged production pointer. Its counts and plan hash therefore describe candidate-chain progress without claiming that production was migrated. The management API exposes production and isolated-candidate counts separately.

An operator can exclusively create a local frozen report without overwriting an existing file:

```powershell
node scripts/check-normalized-us-postal-migration.mjs --allow-pending --write-plan data/checkpoints/normalized-us-postal-fields-v1-plan.json
```

The plan records the exact SHA-256 of every readable current pointer, source manifest, and connector configuration. It is a readiness receipt, not authorization for unattended execution or pointer cutover.

## Current migration state

The initial 2026-09-02 audit found 0 of 25 source pointers at the corrected floor. Twenty-four require a rebuild and Florida is blocked because `FL_SUNBIZ_PUBLIC_PASSWORD` is not present and there is no retained `cordata.zip` or supported published-release replay path. The status checker tests only whether the environment variable exists and never reads its value into the report.

The planned execution order starts with cheap proof cases (FSIS, New York retail food, FDIC, Delaware), then deterministic local-input reuse, then small and medium live acquisitions, the heavy New York/Pennsylvania/NPPES jobs, and finally Florida. Retained governed inputs are reused where their hashes and provenance can be verified, avoiding unnecessary downloads. Every source still requires its independent verifier.

By 2026-09-03, the isolated candidate pass had completed and independently verified all 25 corrected source releases without changing any production pointer. `npm run postal-migration:candidates` reports 25/25 ready, zero remaining rebuilds, and zero blocked prerequisites; its frozen candidate-plan hash is `8642a111b8362faa4311d56674e112870142c05d9a2ef4b6be8af2681e616dd2`. The last large candidates contain 2,360,829 Pennsylvania active registered organizations, 1,959,633 active NPPES organization NPIs, and 4,109,230 Florida active-source organizations. Florida was rebuilt from its independently hashed retained selected-source snapshot, without a network request, credential, raw-archive download, or change to the historical release.

## Cutover boundary

The tooling intentionally does not offer an `--execute-all` connector mode. Existing connector CLIs publish their own `current.json` independently, so invoking every command as one unattended loop would not be a migration-wide transaction.

The separate cutover controller documented in [NORMALIZED-US-POSTAL-CUTOVER.md](NORMALIZED-US-POSTAL-CUTOVER.md) supplies the exclusive migration lock, frozen source/configuration hashes, complete manifest-artifact verification, current-pointer compare-and-swap, durable recovery journal, and guarded pointer-only rollback. Planning fails closed unless every source has a ready isolated candidate. The current 25-source plan passed complete artifact verification and has SHA-256 `505c1039cbd95d7cc3249ca105c9a8e32bc6802b17fa6a7c2173d58fdfc97c1a`; it has not been executed. Execution additionally requires that exact hash and explicit operator confirmation. The full candidate dependency chain must be green before promotion:

1. all 25 corrected source releases;
2. national business registry 2.10.0;
3. entity resolution;
4. entity-resolution benchmark;
5. national business coverage views.

Downstream manifests must pin exact dependency release IDs and manifest hashes. A failure before cutover must leave production pointers byte-identical. A rollback restores pointers only and must never delete or rewrite immutable releases.

## Spatial meaning

This migration does not alter the spatial denominator. Census ZCTA5 polygons remain the complete selected polygon set. ZIP+4 remains address-level routing evidence only, has no polygon, and never participates in ZIP geography joins or partitions.
