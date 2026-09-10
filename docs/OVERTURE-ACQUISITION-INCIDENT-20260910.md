# Overture acquisition incident — September 10, 2026 UTC

The user approved one bounded native acquisition. Co*Tive accepted operation `a8ff9f6d-b2be-4d56-905b-17984788b1d5` at 01:00:13 UTC; it failed at 01:00:24 UTC. Its persisted receipt requires inspection and does not advertise snapshot readiness. No automatic retry or publication occurred.

The retained journal has 24 reservations: 19 completed HEAD requests, four completed GET requests totaling 3,292,783 payload bytes, and one pending GET reservation of 262,144 bytes for asset index 2. Partial transfer on that pending request cannot be inferred from completed counters. All 16 assets passed the initial HEAD checks. No final acquisition manifest exists. Preserve this operation's files; they are diagnostic evidence, not a usable or resumable snapshot.

## Reproduced local defect

An offline bridge reproduction delivered an entire HTTP Content-Length body, delayed transport completion to model its durable journal callback, and let the client close normally. The bridge interpreted the close before `response.end()` as an incomplete transfer and shut down the entire session. The regression test failed with bridge state `closed` instead of `open` before the fix.

The bridge now withholds one payload byte until transport validation and journal completion return successfully, and sends that byte with `response.end()`. This bounds additional retained payload to one copied byte per active response. Early disconnects and transport finalization failures still fail closed. Tests cover single-byte and multiple-chunk responses, empty chunks, exact counters, finalization failure after receiving all upstream bytes, cancellation and backpressure.

This is a demonstrated defect and a plausible contributor to the native failure, not a proven reconstruction of that failure. Existing fixed-error handling does not retain enough stage-specific evidence to distinguish a remote rejection, a bridge shutdown or another transfer failure. Improving bounded, non-sensitive failure diagnostics remains necessary. No external requests were made for the reproduction or regression tests, and a new native acquisition was not dispatched.

## Verification

Focused bridge tests pass (8 tests). `npm run check` passed: 1,664 tests, 1,653 passed, 11 skipped and zero failures; lint, web/desktop builds and desktop control-plane smoke passed. The log is `data/tmp/overture-bridge-final-byte-full-check.log`. TypeScript passed, the production dependency audit reported zero vulnerabilities, and all 82 protected production-plan pins remain unchanged. This change does not alter source budgets, permissions, publication behavior or the failed operation.
