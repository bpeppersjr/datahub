# Minnesota construction streaming acquisition path

Implemented September 8, 2026. This joins the reviewed notice prerequisite to bounded CSV transport and verified selected evidence. It is not yet an enrolled native app operation, and no live full CSV was downloaded for this change.

## What now runs together

`runner/mn-construction-acquired-selection.mjs` exposes `buildMnConstructionAcquiredSelection` with explicit notices, schema preflight, selection context and injected fetch implementation. There is deliberately no default native fetch, CLI dispatch or automatic schedule in this module.

The flow is:

1. Validate the source-use binding, selection context and recent schema receipt before any request.
2. Recheck the fixed export with HEAD, then conditionally GET using its strong ETag.
3. Recheck source use immediately before GET and again after response headers, before passing CSV bytes to selection.
4. Stream bytes into the existing selected-frame builder. Excluded contacts and rejected personal values never reach durable staging.
5. Require exact measured body length and matching final HEAD identity, then capture and bind fresh publisher notices again.
6. Only then deliver successful EOF to the builder, which replays selected evidence, normalizes records, verifies conservation and publishes its manifest last.
7. Independently verify the retained bundle and compare its source-byte count/hash and context against the transport measurement.

All stages share one monotonic observation clock. A rollback between transfer and post-transfer notice capture fails before publication. Old notice evidence can support historical test/replay, not current acquisition permission.

## Transport limits

`runner/mn-construction-transport.mjs` exposes `createMnConstructionExportStream`. It accepts only the fixed registration or residential export from an independently validated schema receipt. Prerequisite evidence must be no older than 15 minutes and not from the future; freshness is rechecked at execution and before rows.

- HEAD → GET → HEAD, one-second pacing before every request, no retries.
- Anonymous requests, redirects denied, identity encoding, strong `If-Match` ETag.
- Exact Content-Length, ETag, Last-Modified and Content-Type agreement with the preflight; unexpected ranges or response URLs rejected.
- 50 MB maximum export; measured bytes must exactly match declared length.
- At most 15 seconds for each response-header wait and 120 seconds for body consumption. Trusted tests can only shorten these ceilings.
- Cancellation covers ignored fetch signals, stalled readers, late responses and Node consumer destruction. The final notice hook receives the same cancellation signal.
- Raw CSV is transient stream data, not a file artifact. A transport receipt is unavailable until the consumer successfully reaches EOF.

Hooks are trusted internal composition points, not authorization tokens. The lower-level transport receipt explicitly does not establish source-use permission, native execution, publisher authenticity, app enrollment or export permission. It returns only measured transport evidence.

## Durable evidence and failure boundaries

The existing [retained selection](MN-CONSTRUCTION-RETAINED-SELECTION.md) format is unchanged. Its verifier now additionally returns the selection receipt from the same bounded, verified read; the integration does not reopen an unchecked path to compare measurements.

Successful integration returns the retained bundle reference, transport measurement, before/after notice evidence and bindings. **The parent acquisition evidence is still in memory, with `evidence_persisted: false`.** The retained child manifest remains `verified-caller-supplied-selection`; do not relabel it as a native acquisition receipt. Native app enrollment must persist and independently verify the parent evidence before claiming handoff.

Schema, metadata, byte, policy or final-notice failure prevents successful EOF and therefore prevents a success manifest. Ordinary partial selected evidence remains for diagnosis; cancellation removes only owned unpublished files through the existing builder. Previously verified bundles remain intact. Failure after a child bundle has committed does not authorize deleting or automatically redownloading that bundle. No automatic restart/resume is claimed.

## Verification

Eleven transport/integration tests cover fixed requests, input snapshots, freshness, byte counts/hashes, HTTP/encoding/source drift, truncation/excess, deadlines, cancellation, hook failure, privacy selection, retained replay and manifest withholding. One integration test uses the exact internally retained reviewed notice receipt, synthetic CSV and an injected transport: success, changed final notice and cross-stage clock regression are covered without any network requests. It explicitly skips if that internal receipt is absent; full publisher articles are not rehosted in public fixtures. On this machine that test ran and passed.

Run checks with process-scoped `TEMP` and `TMP` inside `datahub/data/tmp`. No production code/configuration pins or existing source data were changed by this implementation.

Full validation passed: 1,036 tests discovered, 1,025 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke also passed. The production dependency audit reported zero vulnerabilities. All 82 pending national memory-plan code/configuration pins remained unchanged. The local preview was restored after validation.

## Remaining application handoff

Add a Minnesota app module with durable operation start/checkpoint/terminal receipts, immutable parent evidence, independent verification, cancellation and owned locking. The existing industry runner needs two distinct fixed executable wrappers because it passes `--output` and `INDUSTRY_SEGMENT_RUN_ID`, not a cohort argument, and rejects duplicate script paths. Each wrapper can delegate to the shared module.

The two MN-only construction sources must share a publisher request budget or acquisition lock; separate source IDs alone do not enforce aggregate provider pacing. After verified enrollment, dispatch through Co*Tive and record the actual application operation ID and receipt. Release agent attention after accepted dispatch. Do not activate a refresh schedule or call a native handoff complete merely because transport tests pass.

National reporting, identity reconciliation and coverage integration remain separate work. These business-credential rows are not verified active establishments or a unique business census; ZIP5/ZIP4 remain separate and location points remain nullable. Rollback is to stop calling the new modules; no production pointer rollback or material data deletion is needed.
