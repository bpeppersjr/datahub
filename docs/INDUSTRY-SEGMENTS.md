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

## Tax-exempt organization refresh

The `tax-exempt-organizations` bucket runs the existing governed IRS EO BMF connector as `national-irs-eo-bmf`. This is a cross-industry source grouping, not a mutually exclusive industry classification. It covers the IRS current extract and reported filing addresses, not every nonprofit and not independently verified operating premises. It does not add a new Heatmap industry classification or change the national percentage denominator.

```text
update-industry.bat plan --industry tax-exempt-organizations --state NY,CA
update-industry.bat run --industry tax-exempt-organizations --state NY,CA
```

The run acquires the four national regional files once; NY/CA selection does not reduce the source request scope. The verified Census ZBP baseline remains a prerequisite, followed by the connector's page/date, schema, regional byte/count, duplicate-EIN, quarantine, and normalized-field gates. No credentials or AI are required. The existing IRS policy retains raw regional CSVs internally, excludes personal contacts and financial amounts from normalized records, and permits only approved normalized exports with attribution and limitations.

Optional per-source `coverage_notes` are validated, displayed in plan warnings, and persisted in the run receipt. The IRS notes explicitly preserve the cross-industry, address, operational-status, and export limitations. Cancellation propagates from the runner into the IRS request/stream/normalization lifecycle; once immutable publication begins it finishes its atomic pointer sequence. No live IRS refresh was started merely by adding this bucket. A completed refresh still requires the separate governed national reconciliation chain before appearing in production views.

## Texas sales-tax outlet refresh

The `sales-tax-outlets` bucket exposes the existing governed Texas Comptroller publisher as `state-tx-sales-tax`, only for Texas. This is cross-industry tax-permit outlet evidence, not a retail-only classification or a census of Texas businesses.

```text
update-industry.bat plan --industry sales-tax-outlets --state TX
update-industry.bat run --industry sales-tax-outlets --state TX
```

The verified Census ZBP baseline is required. The connector independently enforces its official Socrata host and selected fields, one provider request at a time, pages of at most 50,000 records, metadata/count drift and minimum-count gates, bounded retries, quarantine limits, and immutable publication. Source-reported NAICS and outlet addresses remain source claims. An active sales-tax permit does not independently prove continuous operation, public access, a currently occupied physical site, or every licensing requirement. Taxpayer mailing fields are excluded, no parent/network relationship is inferred, and normalized record-level data remains local-review-only because names and outlet addresses may identify natural persons or residences.

Managed cancellation propagates through IPC into request, retry, normalization, compression, hashing, and verification work. Cancellation before the publication boundary removes only the run-owned staging directory and leaves existing releases and `current.json` untouched. Once immutable publication starts, its pointer sequence completes atomically. Catalog enrollment does not itself download, submit a queue job, or establish recurring scheduling; the application remains responsible for a separately authorized run.

## FSIS food-processing prerequisite

The governed FSIS MPI connector covers regulated meat, poultry, and egg-product establishments, but it is not yet an industry selector. Its offline-only CLI requires two explicitly supplied official CSV files and the source date printed beside both download links:

```text
npm run fsis:build -- --source-date YYYY-MM-DD --directory downloads/fsis-mpi/MPI_Directory_by_Establishment_Name.csv --demographic downloads/fsis-mpi/Dataset_Establishment_Demographic_Data.csv
```

The generic industry runner supplies only an isolated output root; it cannot safely infer a source date, select arbitrary retained files, or acquire the browser-only inputs. Consequently `food-processing` / `national-fsis-mpi` has not been added to `config/industry-segments.json`. Adding it requires a separate allow-listed input profile or governed prepared-source pointer that pins both files, the source date, bytes, and hashes.

The FSIS CLI accepts cooperative IPC cancellation. It stops between local validation and normalization steps, interrupts gzip backpressure, closes open writers, removes only its cancelled run-scoped staging directory, and leaves `current.json` unchanged. Once immutable publication begins, its release rename and pointer replacement finish without interruption. FSIS active-directory membership remains source-specific regulatory evidence—not proof of general business operation, public access, ownership, or coverage of every food business. Raw CSVs remain internal and the DUNS field remains excluded from normalized/public data.
