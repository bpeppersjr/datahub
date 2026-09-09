# Overture request accounting journal

September 9, 2026. This is operation-bound request accounting, not a source acquisition receipt or managed-worker enrollment. The production preparation command is not changed by this increment.

## Contract and ordering

`createOvertureAcquisitionJournal({output, operationId, executionMode, assetCount})` creates an exclusive UUID directory below an app-contained output root. Its only file is `events.jsonl`: an exact versioned header binds the operation, run, execution mode and asset count, followed by the fixed transport reservation/completion events. It stores no URLs, local bridge capabilities, payloads or arbitrary error values.

Pass its `onEvent` callback to the bounded transport. Each event write is serialized and file-synced before its promise resolves. The transport awaits reservation persistence before starting a fetch. Sequential request identities, a single pending request, matching completions and fixed request/payload limits are validated. Invalid events close admission; existing evidence is preserved. `close()` drains admitted writes and closes the file. File syncing is not a guarantee against power loss or an OS-level protection against hostile filesystem mutation.

The journal bounds accounting to 100,000 requests, 32 GiB reserved payload, 64 MiB per GET reservation and 128 MiB of journal bytes. These are not wire-byte or process-wide quotas. Counts of observed/delivered bytes include **completed requests only**: an interrupted request can have transferred partial bytes without a completion event. Its full reservation remains charged. A missing completion means uncertain/incomplete work, not proof that no request or delivery occurred.

## Inspection and recovery limits

`inspectOvertureAcquisitionJournal(directory, {operationId})` performs bounded, stable, single-link replay of the exact directory/file inventory and event sequence. It returns a file SHA-256, counters and a pending request index if present. It always reports `incomplete-acquisition-evidence`, even when every reservation has a completion. Neither a caller-supplied execution-mode label nor valid accounting proves native source acquisition, authenticity, output integrity or completeness.

The inspector does not resume a process, retry a fetch or authorize a new run. Torn/malformed records are rejected and left for inspection; a well-formed prefix remains incomplete evidence. Separate creations use new run directories and never overwrite an earlier journal. There is no cross-process exclusion or shared/restart budget in this library. A future managed worker must bind the journal hash to immutable asset identities, retained runtime, selected output and its final operation receipt, and classify uncertain termination explicitly.

## Verification scope

Independent transport tests inspect the persisted reservation from inside the fetch callback, retain failed-request evidence without retry, reject the wrong operation ID and prove that closed accounting prevents fetch dispatch. The native local Parquet test now composes retained httpfs, the loopback bridge, bounded injected transport and journal, then replays request counts offline. No dependency or source download is needed. Synthetic/native labels remain distinct; the native query with injected source bytes is not native upstream acquisition.

Large acquisition remains off. Existing business releases, national pointers and the protected production plan are unchanged. Next integrate contained engine/output resource controls and the managed worker, with journal/output hashes bound into its terminal receipt. Rollback is code-only reversion of the journal and test changes; preserve all existing source releases and app receipts.

## Release evidence

Nine focused checks passed: eight journal tests plus the retained-runtime native bridge composition. Full `npm run check` passed with 1,615 tests: 1,604 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Log: `data/tmp/overture-acquisition-journal-full-check.log`. The native runtime selection was `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1`, with no download fallback. TypeScript passed; `npm audit --omit=dev` found zero vulnerabilities. All 82 protected production pins were unchanged. The idle development service was stopped for verification and restored afterward. No managed source acquisition or national promotion was dispatched.
