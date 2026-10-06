# Exact production-plan candidate rehearsal

This command reruns the canonical eight locally pinned production build/verify stages from an explicitly supplied production plan in an isolated candidate directory. It performs no acquisition or network work and never writes production enrollment or production output pointers.

```powershell
npm run reconciliation:production:candidate -- --plan data/reconciliations/production-plans/<successor-plan>.json --run-id candidate-<unique-id> --confirm-plan-sha256 <plan-confirmation-sha256> --confirm-file-sha256 <raw-plan-file-sha256>
```

The plan path must be repository-contained and free of links. Both its internal confirmation hash and its raw file hash must be supplied exactly. The ordinary production revalidator then reconstructs the plan and checks all source, implementation, selection, and optional retained-input pins declared by that plan. Generate a successor plan only after this rehearsal implementation is finalized and committed; a predecessor plan whose implementation inventory predates this code must fail closed.

Outputs and bounded, checksummed logs are confined to `data/reconciliations/production-candidate-runs/<id>`. Its atomic receipt is created before stage one and records each RUNNING/terminal transition, timestamp, PID, log hash, and isolated output release pointer/manifest hashes. A run ID is immutable: an existing terminal or interrupted directory is inspection evidence and is never resumed or overwritten. Cancellation takes effect at a stage boundary.

The controller snapshots the four production pointer files and requires their bytes to remain identical after every stage and on success, failure, or cancellation. Candidate success is evidence for review only: `production_enrollment` remains false and no production pointer is promoted.

## First retained-data rehearsal

`candidate-190-20261005-01` exercised the retained Plan 190 inputs and stopped at registry verification. Its immutable receipt records a failed `registry-build` stage and confirms that every production pointer remained unchanged. Independent replay narrowed the failure to two New York retail-food-store `site.location` assertions whose source-level `premise_coordinate_claim_permitted: false` qualifier had been removed by registry geocode canonicalization. The canonicalizer now preserves that bounded boolean qualifier, and the registry regression test requires it. This correction does not upgrade the coordinates, infer a premises location, mutate the failed candidate evidence, or make Plan 190 executable after its implementation pins changed. A fresh successor plan and unique candidate run are required.

`candidate-191-20261005-01` proved that the qualifier survived the source assertions, then failed on six location-profile shards plus their aggregate count. Location-match profiles have a deliberately narrower coordinate-only schema and had inherited the assertion qualifier verbatim. Their projection now explicitly retains only bounded latitude and longitude while the provenance-bearing assertion continues to retain `premise_coordinate_claim_permitted: false`. This is a compatibility projection, not permission to treat the point as premises-accurate. Candidate 191 remains immutable failed evidence; another committed successor plan and unique candidate run are required.
