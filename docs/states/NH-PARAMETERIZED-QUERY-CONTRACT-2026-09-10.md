# New Hampshire ZIP-query evaluation contract

`runner/nh-childcare-query-contract.mjs` adds a separately versioned, pure evaluator for selected childcare search snapshots. It supports syntactically valid nonzero ZIP5 strings and the observed Licensed Group Child Care Program. ZIP syntax validation does not establish that a postal ZIP exists, belongs to NH or has a Census ZCTA polygon.

This is a prerequisite for app-owned collection, not a collector: it has no browser, network transport, CLI, enrollment, schedule or acquisition authorization. The fixed native probe, its policy, retained receipts and historical parsers are unchanged.

## Binding and result states

Call `evaluateNhChildcareQuery(query, snapshot)` or `evaluateNhChildcareQueryPair(query, before, after)`. A query contains exactly `programType` and `zip5`. Snapshots retain the existing six selected fields: `programType`, `zip5`, `completed`, `displayedRows`, `visibleRows`, and `rows`. Each snapshot must match its requested query; no substitution of the original fixed ZIP occurs. Paired snapshots must independently validate and match exactly.

| Result | Meaning | Accepted candidates |
|---|---|---|
| `unsettled` | Search not completed or displayed count absent | None |
| `row-limit-exceeded` | Settled reported/visible count exceeds 20 | None |
| `count-mismatch` | Settled displayed count differs from visible count | None |
| `settled-zero` | Settled, matching zero displayed/visible/projected rows | None; observed empty projection only |
| `settled-visible-rows` | Settled, matching counts within the 20-row ceiling | Validated normalized candidates |

If more than 20 cards are visible, the snapshot must contain the visible count and an empty projected-row array. It cannot disguise a truncated first page as a complete result. For at most 20 visible cards, every card must be represented. Invalid schemas, duplicate IDs, malformed links, query mismatch or changing paired snapshots throw a fixed diagnostic.

`projection_complete` describes only the supplied bounded projection. Search and statewide completeness remain unknown in every state. Incomplete results retain bounded selected evidence for diagnostics; **consumers must use `candidates` and `accepted_source_rows`, never count `selected.rows` as accepted coverage**. Zero accepted candidates in an incomplete state does not mean zero businesses.

## Field and evidence boundaries

Only names, observed detail links and source address lines are accepted. Unknown fields, accessors, sparse arrays, malformed strings and duplicate source IDs are rejected. Original address lines remain unchanged; full-state normalization recognizes only the observed literal `New Hampshire` grammar. Address ZIP5 and ZIP4 remain separate. Off-query address ZIPs are preserved, while redacted/missing/malformed addresses remain unresolved. Coordinates and current/physical-site verification remain unavailable.

Evidence is labeled `caller-supplied-selected-snapshot`, not native acquisition. Evaluation adds no observation timestamp, policy approval or acquisition coverage. Retained provenance must come from a verified enclosing acquisition receipt. The original six-row receipt replays without modification, and its normalized candidates match the previous offline normalization exactly.

## Remaining collection prerequisites

The current policy permits the fixed ZIP03755 validation, not generalized collection. Before app enrollment, establish the broader source-use basis and a bounded approved scope with publisher pacing, request/disk limits, cancellation, terminal receipts and retained-release reuse. Native evidence must establish whether counts represent all matches, whether pagination/caps exist, and how terminal pages and cross-page duplicates are handled. The observed program type is not all childcare businesses.

An alternative route is the [unsent existing-public-register request draft](NH-PUBLIC-LICENSE-REGISTER-REQUEST-DRAFT.md). A verified official statewide release could be acquired once and partitioned locally; no such delivery has yet been established and no request was sent.

No statewide coverage, new data acquisition, geocoding, national production promotion or public export follows from this contract. Rollback removes these new helpers/tests while preserving all retained source and normalization artifacts.

## Verification

All nine focused tests passed with retained NH evidence enabled. They cover requested-query binding, empty/pending/mismatched results, oversized projections, the exact 20-row boundary, privacy, duplicates, address redaction, off-query ZIPs, pair stability and replay of the retained native sample.

Full `npm run check` exited successfully: 1,798 tests, 1,787 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. Log: `data/tmp/nh-query-contract-check.log`. Available PDF, Iowa reporting, retained-cohort, Overture runtime, Oklahoma inventory, offline NH DOM, retained NH and normalized-manifest prerequisites were enabled. Separate TypeScript validation passed; the production dependency audit reported zero vulnerabilities. The approved Oklahoma scope hash remained unchanged and no failed query was retried.
