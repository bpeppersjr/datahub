# Tennessee childcare connector development

## Metadata preflight contract

Run `npm run tn-childcare:preflight` (or `node scripts/preflight-tn-childcare.mjs`). `--help` does not contact the source; all other arguments are rejected before requests. Successful receipts are written under `data/business-sources/tn-dhs-active-childcare-centers/preflights`, not a production `current.json`.

The first application-side stage is metadata-only, based on the [bounded state source assessment](states/TN-CHILDCARE-ACCESS-2026-09-07.md). It must finish before a dependent acquisition connector is enrolled. It does not download facility records, create normalized entities, publish a source pointer, enable a schedule or approve exports.

The source scope is the fixed Tennessee STS-GIS childcare layer, restricted to publisher status `Active`, provider type `Child Care` and childcare type `Child Care Center`. Family homes, group homes, drop-in centers, authorized providers and education-department facilities are not included in this initial scope. Count results describe source rows, not deduplicated or independently verified businesses.

The command accepts no caller-selected host, SQL, field list or credential. Request limits and cancellation belong to the app. Source identity, schema, CRS, terms and before/after metadata/count agreement must be checked before a successful receipt is stored. Store receipts only inside `datahub`, with observation times, evidence checksums and immutable run-specific names. A matching pair of observations is not transactional snapshot isolation.

The sequence checks layer, item, organization, publisher XML and selected count, then repeats them in reverse order. Parsed JSON payloads and their hashes are retained; XML is preserved byte-for-byte as base64 with byte length, SHA-256 and content type. XML checks are bounded UTF-8/envelope/marker checks, not a full XML parser, schema validator or proof of authentic publisher signatures. XML is never executed and its references are not fetched. Missing XML must remain an explicit gap, not an invented empty metadata file or a ready acquisition state.

Publication timing, source observation time and item/layer modification times remain separate. Neither an active-source filter nor a recent service modification proves current operation, license validity dates or all-state completeness. Retained metadata is source evidence, not automatic policy approval.

## Next gates

Publisher terms include user-assumed risk and a hold-harmless condition for Tennessee and its staff. Preserve these material conditions alongside attribution and warranty disclaimers; this implementation is not a legal determination or authority to accept a new agreement. Publisher XML carries source-purpose/scope narrative even when the item JSON description is empty. Neither empty JSON prose nor metadata-file absence should silently erase those conditions.

After preflight verification, implement bounded ID-based acquisition with privacy-selected fields, source drift detection, complete evidence retention, normalization and independent offline release replay. Normalized records retain ZIP5 and ZIP4 separately and latitude/longitude only on business entities. Keep ownership and unique-business identity unverified and use local-review-only reporting until the integration policy explicitly allows otherwise.

The standalone application owns routine execution after those gates; no live Codex task should be required. A preflight receipt alone must not be treated as a completed acquisition, automatic crash recovery, or scheduler enrollment. Existing immutable releases and the active production rebuild are untouched by these new files.

## Execution and recovery boundaries

`tn-childcare-preflight@1.0.0` permits up to three transient attempts per observation with one-second pacing, a default 30-second deadline through body reading, a one-megabyte response ceiling and a 20,000 selected-row count ceiling. Redirects are rejected. Publisher Retry-After above the 60-second local wait budget defers rather than retrying early. CLI signals and app IPC cancellation propagate through request/read/wait operations.

The writer reconstructs and validates the receipt before storing it, checks canonical datahub paths and lossless Windows file identities, flushes complete bytes, then publishes with an exclusive hard link so an existing destination cannot be overwritten. Cancellation is checked immediately before this commit. After commit starts, an unlink or post-commit ownership-check failure can report an error while a complete receipt already exists; inspect evidence rather than assuming every exception means nothing was written. Abrupt interruption is not automatic recovery. Historical evidence is never rewritten or silently deleted.

## Verified first metadata observation

The standalone CLI completed at `2026-09-08T00:11:12.936Z` (September 7 local time). Receipt: `data/business-sources/tn-dhs-active-childcare-centers/preflights/8f174e2a-2234-408d-9018-337ce938ba7f.json`, 361,296 bytes, SHA-256 `1549d132a944d4ad85ef797ecb458426e52858bf674a7cc3ebbbddac6b967311`.

Root independently checked the receipt hash, all ten parsed-observation hashes, absence of feature/ID request parameters and both raw XML byte/hash pairs. Each XML observation is 104,930 bytes with SHA-256 `6e90fe62991c07898a09dac1aad44ab699078effc358e4532be3a99e54cab8f6`. The app reported 1,863 source records under its fixed filter, zero row-data requests, zero normalized records and no published release pointer. All acquisition, schedule and export readiness flags remain false.

This receipt is evidence that the real metadata path works, not proof of publisher authentication, XML schema validity, current operation or nationwide coverage. Next implement the bounded selected-record acquisition and independently replayable release contract using this verified prerequisite.

Verification: eight focused tests, including real child-process IPC cancellation, and the full 669-test repository check passed. Lint, web/desktop builds, desktop control-plane smoke and TypeScript passed; production dependency audit reported zero vulnerabilities. Independent review checked the source/privacy boundary and immediate pre-commit cancellation. No production implementation pin was changed. Rollback is additive: stop invoking this preflight; retained receipts and existing source releases remain intact.
