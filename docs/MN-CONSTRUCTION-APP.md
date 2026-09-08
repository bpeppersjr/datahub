# Minnesota app-owned construction collection

Implemented September 8, 2026. Co*Tive now has two fixed Minnesota construction entry points, registered in its construction industry bucket, sharing one app operation lifecycle and publisher gate. Development validation uses injected responses; no live full acquisition or national integration is claimed by enrollment alone.

## Operator entry points

```powershell
node scripts/build-mn-contractor-registrations.mjs
node scripts/build-mn-residential-contractors.mjs
```

Each fixes its cohort and accepts only optional `--output <datahub folder>` or `--help`. It reads `INDUSTRY_SEGMENT_RUN_ID` when launched by the existing industry runner. Neither command needs Codex or ChatGPT to execute. Actual invocation performs source requests; verification and promotion should reuse an existing retained receipt instead of running these commands again.

`config/industry-segments.json` registers `state-mn-contractor-registrations` and `state-mn-residential-contractors` as MN-only construction sources with distinct scripts. `config/mn-construction-app-enrollment.json` and the two versioned connector contracts describe policy, network/resource ceilings, privacy, retention and cancellation. Enrollment completes the conditional policy's runtime prerequisite without rewriting historical policy/binding readiness flags. It does not activate refresh schedules or resolve unrelated Minnesota Secretary of State source holds.

## Durable operation lifecycle

`runner/mn-construction-app.mjs` implements a native entry using the fixed fetch wrapper and a separate injected test seam. The native interface rejects URL, fetch, clock, pacing and budget overrides. All requests are checked against the four fixed notice/export URLs and anonymous no-redirect methods.

The app creates a UUID job under `<output>/jobs/<UUID>` and persists `start.json` before any request. The default output is `data/business-sources/mn-dli-construction/app`. A 1.5 GB free-disk preflight runs before requests. Output aliases, manifest-bearing ancestors and nesting inside prior job history are rejected.

Under the shared publisher gate, it:

1. Captures and checks current notices, then saves `notices-before.json`.
2. Performs the bounded two-export schema prerequisite and saves `schema-preflight.json` before the full cohort CSV request.
3. Streams the selected cohort through existing before/after notice and transport checks into privacy-selected, independently verified records.
4. Persists the parent acquisition evidence and `acquisition-checkpoint.json` linking its exact receipt and child manifest.
5. Releases the publisher gate with its one-second handover interval.
6. Independently verifies a success candidate and its source/bundle links, rehashes job evidence, then publishes `receipt.json` without overwriting an earlier terminal record.

Completed acquisition references survive later cancellation or finalization failure. Once the selected bundle is committed, bounded local verification and parent/checkpoint persistence finish without issuing new requests, even if cancellation arrives. The app then records `CANCELLED`, not success. Earlier failures produce a finite redacted `FAILED` receipt where ownership permits. Unknown or foreign files are not overwritten or deleted; partial evidence remains available for investigation. A non-success receipt does not assert whether an uncertain publisher lock was released.

## Parallel jobs and waiting

Both cohorts may be submitted concurrently. They share the same installation-wide gate, not separate per-output locks. A busy job persists `publisher-wait.json` and waits cooperatively for at most fifteen minutes, checking approximately once per second. Waiting honors cancellation and cannot begin a new attempt after its deadline. Expiry records `BLOCKED` with no source request from that waiting job.

This is local lock waiting, not a network retry. Source requests still have zero automatic retries. The industry runner sees a nonzero process exit as failure and does not automatically requeue it; the app handles ordinary gate contention before returning. A crash-left or corrupt lock still requires inspection, never automatic PID-based takeover. No automatic interrupted-run restart, freshness deduplication or schedule activation is implemented.

## Independent verification and truthful claims

```powershell
node scripts/verify-mn-construction-app.mjs --receipt data/business-sources/mn-dli-construction/app/jobs/JOB-UUID/receipt.json
```

Replace the placeholder with an actual operation receipt. Verification makes no network requests. It checks the enrollment pin, start/terminal linkage, exact prerequisite evidence, acquisition checkpoint, parent/child checksums, cohort/run identity, chronological boundaries and artifact roster. Completed acquisition retained by a failed or cancelled job is also independently verified before being returned as a reusable reference.

`fixed-native-fetch` records which app entry point executed; it is not independent authentication of the publisher or network execution. Tests are explicitly `injected-test-transport`. Both keep native execution independently verified, source authenticity, public export and national integration false. An Issued registration/license is not proof of an active business, verified establishment or unique entity. Source addresses remain reported assertions; ZIP5/ZIP4 remain separate and geocodes nullable.

Runtime enrollment is not a completed handoff. Actual dispatch must return an application operation ID and persisted receipt; after accepted dispatch, agents should move to other validation/development work rather than monitor downloads. No native Minnesota operation was dispatched during this implementation turn.

## Validation and rollback

Release validation: `npm run check` passed (1,059 tests passed, 11 skipped, zero failures), including lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending national production code/configuration pins were unchanged. The registry now contains 49 connectors and 46 source-policy profiles; Minnesota enrollment remains explicitly unmeasured in the national coverage ledger until reporting integration.

Isolated child-process tests cover success and offline replay, terminal/checkpoint tampering, both cohorts running concurrently, bounded/cancelled gate waiting, enrollment/configuration rejection, HTTP failure, cancellation during transfer and after acquisition commit, and later finalization failure with retained data. The fixed CLIs reject endpoint overrides; the industry plan exposes exactly two Minnesota tasks without claiming Wisconsin coverage. Tests use synthetic CSV and retained internal publisher article fixtures, with an explicit skip when that fixture is absent and no automatic fixture download.

Rollback is to remove these two source registrations from future plans and stop invoking their entry points after checking actual operation state. Preserve job receipts, selected bundles and parent evidence. Do not erase an occupied publisher gate or repull retained data as a rollback shortcut. Existing national production pins and source releases remain unchanged.
