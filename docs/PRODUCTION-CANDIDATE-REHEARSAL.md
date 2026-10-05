# Exact production-plan candidate rehearsal

This command reruns the canonical eight locally pinned production build/verify stages from an explicitly supplied production plan in an isolated candidate directory. It performs no acquisition or network work and never writes production enrollment or production output pointers.

```powershell
npm run reconciliation:production:candidate -- --plan data/reconciliations/production-plans/<successor-plan>.json --run-id candidate-<unique-id> --confirm-plan-sha256 <plan-confirmation-sha256> --confirm-file-sha256 <raw-plan-file-sha256>
```

The plan path must be repository-contained and free of links. Both its internal confirmation hash and its raw file hash must be supplied exactly. The ordinary production revalidator then reconstructs the plan and checks all source, implementation, selection, and optional retained-input pins declared by that plan. Generate a successor plan only after this rehearsal implementation is finalized and committed; a predecessor plan whose implementation inventory predates this code must fail closed.

Outputs and bounded, checksummed logs are confined to `data/reconciliations/production-candidate-runs/<id>`. Its atomic receipt is created before stage one and records each RUNNING/terminal transition, timestamp, PID, log hash, and isolated output release pointer/manifest hashes. A run ID is immutable: an existing terminal or interrupted directory is inspection evidence and is never resumed or overwritten. Cancellation takes effect at a stage boundary.

The controller snapshots the four production pointer files and requires their bytes to remain identical after every stage and on success, failure, or cancellation. Candidate success is evidence for review only: `production_enrollment` remains false and no production pointer is promoted.
