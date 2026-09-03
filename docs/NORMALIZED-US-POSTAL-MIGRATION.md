# Normalized U.S. postal-field migration

Registry publisher 2.10.0 requires each normalized U.S. address to keep the five-digit ZIP and optional four-digit routing extension in separate fields. Existing immutable releases are preserved. They are never edited in place.

## Readiness gate

Run the read-only status command before any registry rebuild:

```powershell
npm run postal-migration:status
```

The command reads the 25 governed source pointers, their exact release manifests, and the connector configurations. It reports the current release version, the required correction floor, the build and verification commands, missing rebuild prerequisites, and a deterministic frozen-plan SHA-256. It does not run a connector, contact a provider, change a pointer, or print credential values.

`npm run postal-migration:check` uses the same inspection but exits unsuccessfully until every current source release satisfies the migration floor. `npm run registry:build` runs that assertion before loading source artifacts or creating registry staging files, so registry 2.10.0 cannot accidentally depend on a mixed or legacy source set.

An operator can exclusively create a local frozen report without overwriting an existing file:

```powershell
node scripts/check-normalized-us-postal-migration.mjs --allow-pending --write-plan data/checkpoints/normalized-us-postal-fields-v1-plan.json
```

The plan records the exact SHA-256 of every readable current pointer, source manifest, and connector configuration. It is a readiness receipt, not authorization for unattended execution or pointer cutover.

## Current migration state

The initial 2026-09-02 audit found 0 of 25 source pointers at the corrected floor. Twenty-four require a rebuild and Florida is blocked because `FL_SUNBIZ_PUBLIC_PASSWORD` is not present and there is no retained `cordata.zip` or supported published-release replay path. The status checker tests only whether the environment variable exists and never reads its value into the report.

The planned execution order starts with cheap proof cases (FSIS, New York retail food, FDIC, Delaware), then deterministic local-input reuse, then small and medium live acquisitions, the heavy New York/Pennsylvania/NPPES jobs, and finally credential-gated Florida. Six entries use retained governed inputs to avoid unnecessary downloads. Every source still requires its independent verifier.

## Cutover boundary

The current tooling intentionally does not offer an `--execute-all` mode. Existing connector CLIs publish their own `current.json` independently, so invoking every command as one unattended loop would not be a migration-wide transaction.

Before automating the final cutover, add an exclusive migration lock, isolated candidate roots or stage-only publishers, frozen input and code/config hashes, artifact verification receipts, current-pointer compare-and-swap, deterministic recovery, and guarded pointer-only rollback. The full candidate dependency chain must be green before promotion:

1. all 25 corrected source releases;
2. national business registry 2.10.0;
3. entity resolution;
4. entity-resolution benchmark;
5. national business coverage views.

Downstream manifests must pin exact dependency release IDs and manifest hashes. A failure before cutover must leave production pointers byte-identical. A rollback restores pointers only and must never delete or rewrite immutable releases.

## Spatial meaning

This migration does not alter the spatial denominator. Census ZCTA5 polygons remain the complete selected polygon set. ZIP+4 remains address-level routing evidence only, has no polygon, and never participates in ZIP geography joins or partitions.
