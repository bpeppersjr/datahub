# Bounded streaming selected output

September 9, 2026. These internal components replace the need for an unbounded `COPY` destination in the forthcoming governed extraction worker. The existing production preparation command is not yet migrated. No remote place records were acquired.

## Query streaming

`streamOvertureJsonRows({connection, query, signal})` accepts a worker-owned connection and trusted query returning one `record_json` string column. It fetches chunks lazily and yields strings individually, rather than collecting the whole result in JavaScript. Early consumer return or cancellation interrupts the unused query; pending native calls must settle before the iterator returns. The worker remains responsible for exclusive connection ownership, query authorization, engine memory/spill configuration and final handle closure. Never expose this internal query argument as user-supplied SQL.

Engine errors are replaced with fixed diagnostics because query text may contain ephemeral bridge capabilities. String rows are bounded to 16 MiB before delivery to the writer. Chunked consumption does not prove that every database operator streams or that total process memory is bounded; intermediate operators can materialize data under the engine's own limits.

## Output writer

`writeOvertureSelectedOutput({rows, output, signal})` consumes an asynchronous string iterator and writes gzip JSON Lines into an exclusive UUID directory under an app-contained output root. Native limits are 20 million rows, 16 MiB per line, 16 GiB raw JSON Lines and 4 GiB compressed output. Disk free-space checks require 5 GiB before creation and recur at compressed-byte intervals of 64 MiB. This is sampled headroom, not a filesystem quota or a budget shared with other jobs.

Each line must be a JSON object without raw CR/LF and with valid UTF-8 round-trip framing. The original text is preserved; no fields are added, combined or silently truncated. Empty results produce a valid zero-record gzip. The writer does not validate the selected business schema, ZIP fields, source status or provenance. Its descriptor explicitly denies schema and native-acquisition verification.

Compression and file writes use backpressure. Compressed chunks are checked against the output cap before writing. Success returns file bytes/hash, raw bytes and row count only after file synchronization and integrity checks. Failure preserves the partial file without a success descriptor. Cancellation is cooperative: producer and file operations must settle before handles close; a producer that never settles can delay closure. There is no hard process deadline in these libraries.

The separate test writer permits only tighter limits (and reduced test disk-floor requirements), not production overrides. No final source manifest, current pointer, refresh schedule or managed-operation receipt is published by the writer.

## Native local composition

The opt-in native test reuses verified runtime operation `b4ae8318-e786-4ac8-bf7b-e673c6d00ae1`. It creates a tiny Parquet locally, reads it with native retained httpfs through the loopback bridge and injected bounded transport, records reservations/completions in the journal, streams JSON into the gzip writer, then independently decompresses and checks expected rows and the compressed checksum. The original two-row fixture has been [expanded to six source inputs and three selected outputs](OVERTURE-STREAMING-QUERY.md). All temporary files remain inside `datahub/data/tmp` and are removed after test handles close. No runtime dependency or source download occurs.

This demonstrates local component composition and the fixed selection projection, not real upstream acquisition, validation of the current remote schema or national coverage. Next compose the fixed production query, retained-runtime admission, contained engine/spill setup and terminal receipt binding into the managed worker. Large acquisition remains off. Rollback is code-only reversion of these internal adapters/tests; preserve retained business releases and prerequisite receipts.

## Release verification

Ten focused checks passed, including the opt-in native composition. Full `npm run check` passed: 1,624 tests, 1,613 passed, 11 skipped, zero failures, followed by lint, web/desktop builds and desktop control-plane smoke. Evidence: `data/tmp/overture-selected-output-full-check.log`. TypeScript passed and the production dependency audit found zero vulnerabilities. All 82 protected production pins were unchanged. The idle development service was stopped for verification and restored afterward; no managed source acquisition was dispatched.

Cancellation during a pending query-chunk fetch (synthetic connection) and a pending input iterator is tested. Pending sink-write ownership was reviewed in code; the suite does not inject a delayed native filesystem write. The writer explicitly drains its tracked write promise before closing the handle. Final stored-content hashing is tested with a real same-size file mutation while the iterator is held.
