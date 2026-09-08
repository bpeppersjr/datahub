# Minnesota selection 1.1: byte framing and explicit text gaps

The [confirmed registrations encoding incompatibility](MN-CONSTRUCTION-ENCODING.md) is handled by `mn-construction-selected-stream@1.1.0`, without declaring or guessing a replacement source encoding.

## Processing boundary

1. Measure and hash original source bytes under the existing 50 MB ceiling. Source hashes include an optional leading UTF-8 BOM.
2. Remove only an absolute-source leading UTF-8 BOM for parsing. Frame CSV with a reversible one-byte Latin-1 projection, strict quotes/column counts and the existing record/row ceilings. This projection is **not** interpretation of business text as Latin-1.
3. Exclude nonliteral `Business` and non-`Issued` rows without decoding names, contacts or addresses.
4. Reconstitute the twelve selected field values as bytes and decode each with fatal UTF-8 validation. Keep valid Unicode exactly in the selected evidence; preserve existing normalization rules. A row with undecodable selected text contributes one `invalid-selected-utf8` rejection with only its ordinal and reason retained. Do not retain its values or replace unknown characters.
5. Discard unselected fields without decoding or persisting them. Invalid bytes in an excluded contact field do not invalidate otherwise sound business fields, but malformed CSV structure still fails the acquisition.
6. Publish only after complete transport, row conservation, selected-data replay and the existing source-use/manifest checks succeed. Neither partial files nor rejected rows become business coverage.

This permits valid records to continue past unresolved text while explicitly counting the resulting coverage gap. It does not recover names whose encoding remains unknown, establish physical locations, infer geocodes or change public export authorization. ZIP5 and ZIP4 remain separate.

## Versioning and compatibility

Both Minnesota connector manifests are version 1.1.0 and identify the new selected-stream version. New selection receipts contain seven exact rejection-count keys. Replay dispatches by explicit schema version: retained 1.0.0 receipts keep their original six-key roster and cannot acquire the new reason retroactively. Version 1.1 replay also rejects lone surrogate strings, which cannot result from valid UTF-8 decoding.

The normalized record contract, historical app envelopes, policy profile, enrollment pin and national production pins are unchanged. No old source release or receipt is rewritten. A malformed one-column high-byte tail remains a CSV structure failure, not an accepted row or an invented encoding finding.

## Verification and operation

Release checks passed: `npm run check` completed with 1,069 tests passed, 11 skipped and zero failures, plus lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. All 82 pending national production code/configuration pins remained unchanged.

Offline tests cover invalid bytes in selected names versus discarded contact fields, split-byte valid accents, quoted delimiters and multiline contacts, BOM position, exact source hashing, row conservation, legacy replay, cross-version reason rejection, invalid Unicode scalars and the complete app receipt lifecycle. The mixed-encoding app fixture accepts 59 of 60 synthetic rows, records one encoding rejection, and independently verifies its retained bundle without network requests.

Any new complete acquisition must be submitted to the existing Co*Tive managed collection service. Verify that no prior complete acquisition can be reused, preserve earlier failed job history, and retain the new app operation ID. The app owns transfer and cancellation; agents must not poll ordinary download progress. A new accepted dispatch is not a claim that acquisition or national integration succeeded.

After commit `8152176` passed validation, Co*Tive accepted operation `a01b1819-420b-4036-a5fb-40f9c29ba861` at 2026-09-08T13:11:19.018Z for exactly the two MN construction tasks. Its start receipt was confirmed at `data/managed-operations/a01b1819-420b-4036-a5fb-40f9c29ba861/receipt.json`, and its app supervisor PID 12360 was confirmed present. These are historical handoff observations, not a completion claim. Before dispatch, managed history had no active/unresolved operation and the prior MN industry receipt remained failed. No refresh schedule or agent download-polling loop was created. Inspect current app history for the terminal outcome and independently verify any retained acquisition before reporting integration.

Rollback should disable future collection submissions and inspect active operation ownership before code changes. Never relabel a 1.1 receipt as 1.0 or delete failed/partial history to force a retry; 1.1 retained receipts require a verifier supporting their exact reason roster.
