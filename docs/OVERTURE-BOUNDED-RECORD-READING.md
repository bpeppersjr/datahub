# Bounded Overture record reading

`streamOvertureGzipRecords({filename, signal?, limits?})` reads local gzip JSONL evidence incrementally. It is now used by the legacy Overture source counter, normalization builder and release verifier. Counting and the builder pass their cancellation signal into decompression instead of checking it only after a record arrives.

Default per-file ceilings are 4 GiB compressed, 16 GiB decompressed, 16 MiB per line and 20 million records. Optional limits can only tighten these values. Files must be absolute paths inside `datahub`, ordinary single-link files without symbolic-link ancestors. Identity, size and timestamps are checked against the opened handle before reading and again after complete iteration. Reading is bounded to the initially observed file size. These checks are not a race-free filesystem sandbox or proof against every same-size concurrent write.

The reader requires valid UTF-8, JSON objects and newline-terminated records; empty gzip datasets are supported. Blank records, JSON primitives/arrays, malformed or truncated gzip and incomplete final lines are rejected with a fixed error that omits source contents. CRLF remains valid JSON whitespace before the LF delimiter. Unlike the former readline path, it does not silently skip blank lines or accept an unterminated final record. Existing canonical writer output already uses newline-terminated object records.

Line fragments are accumulated within the line ceiling and concatenated once per record. Early iterator return or an error destroys the input/decompressor, drains their pipeline and closes the owned file. Cancellation interrupts the pipeline and is checked at iteration boundaries; a consumer that stops calling the iterator must still return/close it. No operating-system memory cap or hard process deadline is claimed. Parsed objects and consumer-retained data add memory beyond the compressed/decompressed stream buffers.

## Proof boundary

The reader is an input guard, not a completed normalized release. Records yielded before EOF are provisional: callers must exhaust successfully before publishing. It does not verify a source receipt/hash, replay normalization, resolve duplicates, establish valid USPS membership, or claim complete business coverage.

The legacy builder still requires managed acquisition-receipt binding, integration of disk-backed identity checking, output/disk ceilings and separation of normalization from promotion. Its aggregate maps and publication path have not been made production-ready by this change. Limits are per file, not a total cap across output partitions. The new app-normalization worker remains unfinished; no production dataset was normalized or published here.

## Verification and migration

Focused tests cover Unicode, genuine numeric zero and separate postal fields; multi-chunk lines; empty input; corrupt/truncated gzip and UTF-8; object framing; every resource ceiling; cancellation and early return; changed files, hard links and invalid invocation. Existing offline Overture build/quarantine/publication/verifier tests pass.

`npm run check` passed: 1,672 tests, 1,661 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/overture-bounded-reader-full-check.log`. TypeScript passed, production dependency audit reported zero vulnerabilities, and all 82 protected production-plan pins remained unchanged.

No retained source files are rewritten or downloaded. Rollback removes the reader integration and module without deleting evidence; it restores the previous unbounded reader behavior and should not be used as a limit-bypass workflow.
