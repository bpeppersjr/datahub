# Minnesota construction: application handoff

On September 8, 2026 at 12:52:14 UTC, the existing local Co*Tive managed-operations service accepted the Minnesota construction collection as operation `cd9c3c93-ab0c-429e-9553-ef6252625ac0` (HTTP 202).

## Scope and evidence

- Selection: `industries: ["construction"]`, `states: ["MN"]`.
- Read-only app planning returned exactly `state-mn-contractor-registrations:MN` and `state-mn-residential-contractors:MN`; no unrelated state or national task was selected.
- The app's managed history contained only terminal operations before dispatch. The Minnesota source directory contained prerequisite evidence, not a retained acquisition requiring reuse.
- The managed receipt was persisted at `data/managed-operations/cd9c3c93-ab0c-429e-9553-ef6252625ac0/receipt.json` before this handoff was recorded. Its observed status was `RUNNING`, with supervisor PID 24988 and child PID 33616. The supervisor was confirmed present. PIDs and this status are historical observations, not ongoing liveness guarantees.
- The app owns downloads, source validation gates, local publisher waiting, cancellation, selected-data persistence and terminal receipts. No agent download-polling loop or new refresh schedule was created.

This is accepted dispatch, not proof of successful acquisition, record counts, active businesses or national coverage. Consult the current application receipt for the outcome; do not infer it from this document. If a source gate fails, investigate that specific failure rather than disabling the gate or automatically retrying.

## Reuse and subsequent integration

The industry receipt is `data/industry-segments/runs/cd9c3c93-ab0c-429e-9553-ef6252625ac0/receipt.json`. Each cohort writes its own immutable job history beneath its source-specific task output. Use [the independent app verifier](MN-CONSTRUCTION-APP.md#independent-verification-and-truthful-claims) on a terminal cohort receipt before consuming retained records. A failed or cancelled job may still reference a completed acquisition: verify and reuse it rather than requesting the export again.

Next data-engineering work is reporting integration of independently verified retained evidence. Credential counts must remain separate from unique active businesses and physical sites. Keep selected records internal/local-review-only, ZIP5 and ZIP4 separate, and absent geocodes null. No source entity polygons are needed. National reconciliation must use the retained source evidence; this operation does not promote data or update national pointers.

The pending national memory-rebuild launch is unrelated and was not retried or replaced by this handoff. Existing production data, release pointers and pinned implementation files were not edited. The acquisition lifecycle code was validated in commit `a1e992b`; this handoff adds only an operational documentation record, with no runtime code changes.
