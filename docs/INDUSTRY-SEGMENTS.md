# Industry/state segment orchestration

`config/industry-segments.json` is the allow-listed map from logical industry buckets to existing source builders. It is intentionally explicit: a national source has `states: "all"` and is run once, while a state source lists the states it actually supports. A national connector is never presented as state-filterable; a plan reports that it is being run once and that the selected states are coverage metadata.

## Plan and run

Planning is read-only and validates the config, builder paths, industry IDs, and state codes before producing tasks:

```text
node scripts/run-industry-segments.mjs plan --industry health-care,financial-services --state NY,TX
```

Execution is opt-in:

```text
node scripts/run-industry-segments.mjs run --industry construction --state WA
```

Each run is isolated under `data/industry-segments/runs/<run-id>/`. `plan.json` preserves the validated task plan; `receipt.json` is updated after every task and includes status, timestamps, state, source, and SHA-256 hashes for completed logs. Child output is kept in `logs/`; credentials are not passed in command arguments. `Ctrl-C` stops further launches, sends an IPC cancellation request into each active builder's AbortSignal, waits for closure, and marks queued tasks cancelled. A ten-second grace period precedes forced termination for an unresponsive subprocess. Unpublished staging artifacts remain isolated for inspection; an abrupt OS shutdown cannot guarantee cleanup.

At most ten source builders run at once (the config may lower this). Shared national sources are deduplicated across selected industries and states. State builders run independently and only for their configured publisher state; records can describe premises outside that state. All declared prerequisite paths are checked before any subprocess starts. The existing builders validate the prerequisite contents and enforce source-specific quality gates.

Windows users can run `update-industry.bat plan --industry construction --state WA`, followed by the same command with `run`. The equivalent npm commands are `npm run industry:plan -- --industry construction --state WA` and `npm run industry:run -- --industry construction --state WA`. No model, Codex, or ChatGPT connection is needed.

Published source releases stay inside their run folder. They require a subsequent registry, resolution, benchmark, and coverage rebuild before appearing in production national views. Logs are local and inherit source-connector redaction behavior. An interrupted run is retained for inspection; start a new run ID to retry, since run folders cannot be overwritten. Automatic restart recovery and scheduling are not implemented by this CLI.

Plans also report per-industry/state gaps where no state-scoped source is configured. An empty plan is a failed run. This runner does not download data during planning and has no AI or discovery behavior. Existing builder scripts remain the source of acquisition and validation policy; this layer only coordinates them.
