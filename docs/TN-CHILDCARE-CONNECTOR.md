# Tennessee childcare connector development

## Verified recovered source release

Standalone offline recovery completed at processing time `2026-09-08T00:57:19.864Z`, retaining original source observation `2026-09-08T00:36:36.628Z`. Immutable manifest: `data/business-sources/tn-dhs-active-childcare-centers-recovered/releases/tn-childcare-recovered-307bc79c-4f4f-4c77-a349-73dfd9fb1801/manifest.json`; SHA-256 `98234ee44e52e9fcf8cdecfb1812b49029a2444316832df95f90b18518ffa55d`. The recovered current pointer references this exact manifest. Source identity remains `tn-childcare-a142397a0b6418ee017226d981d89314c54f17cd2ee03decd3337065260bb2c7`.

All 1,863 selected records are accepted, with zero quarantines. Of those, 1,691 have source ZIPs, 27 have missing-source-ZIP flags and 145 have invalid-source-placeholder flags; three coordinate pairs remain missing. These are retained source records, not verified unique operating businesses or a complete Tennessee childcare census. Missing ZIPs remain unassigned postal evidence, not manufactured ZIP coverage.

The recovery command and a separate verifier process ran with `fetch` disabled. All seven artifacts independently replayed, the current pointer hash matched, and no owned staging remained. The original failed run and source bytes were preserved; recovery did not reacquire data, change its observation date, or change national production inputs. All 715 repository tests, lint, web/desktop builds, desktop smoke and TypeScript passed; production dependency audit reported zero vulnerabilities. Independent review covered self-contained verification with the entire original run unavailable, malformed-pointer protection, disjoint output paths, input/output tamper rejection, cooperative cancellation and the unchanged five-percent gate.

Next use this verified local-review release for a Tennessee registry loader/adapter. No national reporting promotion, export approval, recurring refresh or increased all-business completeness is claimed. Rollback is additive: stop selecting the recovered source, preserve its immutable release and the original failed evidence, and leave other source pointers unchanged.

## Offline recovered-release contract

Recovery is a distinct application operation, not a retry of the downloader. It must accept the exact failed receipt, staging directory and four reviewed SHA-256 pins, run the read-only inspector first, then create a new immutable release under a separate recovered output root. It must not modify the failed job, reclaim its locks, overwrite source files, fetch publisher data or advance the source observation time.

The recovered release must retain byte-identical selected features, acquisition observations, publisher XML, failed app receipt and failure log. Normalized rows use explicit transformation 1.0.1; accepted/quarantined counts are replayed and the five-percent gate stays unchanged. Missing ZIPs are accepted source evidence with explicit quality gaps, not verified postal assignments. Publication time and recovery processing time are not evidence of fresh publisher data.

The independent verifier must operate entirely from the immutable recovered directory. It must validate the copied failed-run/task/log lineage, reproduce the original 1.0.0 failure, replay the complete acquisition, revalidate the local source-policy configuration and reproduce exact 1.0.1 normalized/quarantine bytes. Parent receipt/artifact hashes are provenance anchors, not signatures authenticating the publisher. The original staging location may remain archived or unavailable without making the recovered release unverifiable.

Publication uses an exclusive output lock, owned run staging, verification immediately before commit and an atomic current-pointer replacement. Cooperative cancellation applies before commit; a disk failure after release rename can leave an unpointed release requiring inspection. Do not automatically steal locks, remove foreign files or restart acquisition after ambiguous publication.

The standalone commands are `npm run tn-childcare:recover -- <explicit pinned options>` and `npm run tn-childcare:verify-recovered -- <immutable manifest path>`. Recovery takes `--receipt`, `--staging`, `--receipt-sha256`, `--selected-sha256`, `--observation-sha256`, `--xml-sha256` and an optional separate `--output` inside `datahub`. There is no URL, transport, transformation or quality-limit override. The recovery manifest identifies connector 1.0.1 and recovery implementation 1.0.0, while legacy acquisition remains connector/transformation 1.0.0. This is a standalone command, not an automatically enabled recurring schedule or a newly added UI control.

### National integration still required

Source publication alone does not add Tennessee to national reporting. A separate verified loader and adapter must retain the failed-run recovery lineage, source status and missing-ZIP reasons. Source-relative site/establishment evidence must not imply ownership, independently verified operation or cross-source identity matching. Missing ZIPs must not produce a fabricated `site.zip-code` assertion. Coordinate-derived Census geography may support reporting, but cannot replace the unavailable source ZIP or establish USPS validity. Keep Tennessee's DHS-center-only denominator distinct from Massachusetts/New Jersey scopes and expose the missing-coordinate and postal gaps in downstream counts.

## First acquisition outcome and offline recovery boundary

App run `tn-app-acquisition-20260907-01` finished **failed** at `2026-09-08T00:36:36.778Z`. Acquisition completed, but normalization 1.0.0 accepted only 1,691 of 1,863 selected records. The 172 rejected records exceed the unchanged five-percent quarantine gate: 145 contain source ZIP string `0`, and 27 contain an empty ZIP. These are unavailable postal values, not compact ZIP+4 formatting. No source release or current pointer was published. Do not rerun acquisition to repair these retained values.

The exact retained directory is `data/industry-segments/runs/tn-app-acquisition-20260907-01/state-tn-childcare-TN/.staging/f295bca2-7509-4d5e-ae13-84504c86a1b7`. Offline acquisition replay confirmed all 1,863 records and exact selected JSONL/XML byte agreement. Evidence pins:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Failed app receipt | 4,388 | `b6762d1a12619d9ad90b59b40b8cbe82af78b0b8de1a680d1ed687a063125033` |
| selected-features.jsonl | 707,895 | `67a0adc8ef8edf18d26c46e085123145db0e865c3dcaf3537b6b1a8192ad02bc` |
| source-observation.json | 1,462,063 | `3da6b88326e6932fb5ba6ece8aebcee08cacee18492b2fd6e2bbcb81c71706ce` |
| publisher-metadata.xml | 104,930 | `6e90fe62991c07898a09dac1aad44ab699078effc358e4532be3a99e54cab8f6` |

Recovery must preserve the failed receipt and all retained source bytes. An additive transformation can represent unavailable ZIPs as null ZIP5, postal alias and ZIP4 with an explicit reason; it must never replace them with a guessed ZIP, zero padding or a ZCTA identifier. Missing ZIPs remain a postal coverage gap even when source coordinates exist. Historical transformation 1.0.0 and its rejection results remain reproducible. A future recovered release must have a new identity, original source observation time, separate processing time and parent evidence hashes. A failed staging directory is not a published parent release. National reporting, automatic recovery publication and scheduled refreshes remain separate gates.

`tn-childcare-normalization@1.0.1` is an explicit opt-in pure transformation. Null, empty and control-free blank source ZIPs produce `missing-source-zip`; exactly the raw string `0` produces `invalid-source-zip-placeholder`. All three normalized postal fields are null in those cases. Other malformed ZIPs, compact nine-digit strings, padded zero placeholders and control characters still reject. Valid ZIP5 and hyphenated ZIP+4 behavior is unchanged. Names, street addresses, city, state, coordinates, scope and policy retain their existing checks. The release builder still selects historical 1.0.0; this additive transformation alone neither publishes data nor bypasses a quality gate.

Use `npm run tn-childcare:inspect-recovery -- --help` for the read-only inspector. It requires explicit failed-receipt and retained-staging paths plus SHA-256 pins for the receipt and all three retained artifacts. It verifies the receipt-pinned failure log, exact lineage/roster, acquisition replay and legacy normalization failure without provider requests or writes. `eligible-for-recovery-review` is not a recovered release, updated source observation, export approval or national reporting contribution.

The inspector was executed against the real pinned files above and reproduced 1,691 accepted / 172 quarantined historical records. Independent local execution of explicit 1.0.1 accepted all 1,863, preserving 172 unavailable ZIPs and three missing point pairs. Nothing was published or downloaded by these checks. Six inspector tests, 17 normalization/legacy-release tests, independent review, all 706 repository tests, lint, builds, desktop smoke, TypeScript and a zero-vulnerability production dependency audit passed. Rollback: stop invoking the additive inspector/version; original acquisition evidence and legacy release behavior are preserved.

## Standalone release and app-worker contract

The source builder and verifier expose `npm run tn-childcare:build` and `npm run tn-childcare:verify -- <immutable-manifest-path>`. The build accepts only an optional output path inside `datahub`; verification accepts a release manifest rather than `current.json` and must not request provider data. Both commands support cooperative signals and app IPC.

Each source release retains five artifacts: selected features, normalized records, quarantine, replayable source observations and byte-preserved publisher XML. The manifest carries versioned provenance, restrictive policy, artifact hashes and counts. Replaying retained acquisition and normalization must reproduce the exact release—not merely match a newly supplied checksum. A release needs at least one accepted record and no more than five percent quarantine. Private-field/scope drift fails the acquisition rather than being treated as harmless quarantine.

The `childcare` industry has an independent `state-tn-childcare` worker for Tennessee only. Selecting Tennessee must neither run the MA/NJ sources nor imply that their populations have identical scope. The coverage ledger remains unmeasured until a separate national-reporting integration publishes evidence. Enrollment alone does not enable a recurring schedule or submit a job.

The final publication transaction must preserve earlier releases and prevent concurrent writers. Cancellation before commit removes only owned staging; ordinary failures retain inspectable evidence. After commit starts, pointer publication completes without cooperative interruption. A disk failure after the release rename can leave a valid unpointed immutable release: inspect it before retrying, rather than repulling blindly. Reboot, process death or ambiguous ownership requires inspection; no lock is reclaimed solely because a process ID is absent or a timeout elapsed.

## Acquisition and normalization modules

Release/enrollment verification: ten focused release/CLI tests and three managed-worker tests passed, including real child IPC cancellation, offline publication/replay, strict scope/privacy rejection and immutable-pointer preservation. The full 698-test repository check, lint, web/desktop builds, desktop smoke, TypeScript and production dependency audit (zero vulnerabilities) passed. Rollback is additive: stop selecting the Tennessee worker; retain its immutable evidence and do not remove unrelated source releases.

The first real standalone industry run is `tn-app-acquisition-20260907-01`, dispatched with plan SHA-256 `9f5e5f5dee2fa828743b6b670a43ad53c962e6dfc25cfad8fe38b299e5c16a03`. Its authoritative status is `data/industry-segments/runs/tn-app-acquisition-20260907-01/receipt.json`. Dispatch is not completion; no AI supervision or recurring schedule is required or enabled by this one-time handoff.

`acquireTnChildcare` and `replayTnChildcareAcquisition` implement bounded application-side acquisition and pure local replay. `normalizeTnChildcareFeature` implements source-record normalization. These functions write no files or pointers. The release builder/verifier and managed industry enrollment described above now wrap these modules; the existing preflight CLI remains metadata-only.

Acquisition completes the ten-observation preflight before requesting any IDs or features, requires available complete publisher XML byte evidence, fetches a sorted ID inventory, and requests exact batches of at most 100 IDs with URLs no larger than 2,000 bytes. It repeats the inventory and full preflight afterward. Every row must belong to the requested ID batch, selected schema and center-only scope. Duplicate/missing IDs, truncated responses, private fields, non-WGS84 point evidence and changed metadata/XML/counts fail the acquisition.

Selected/ID query responses are limited to eight megabytes each and 100 megabytes of actual consumed response-body bytes cumulatively, including whitespace and partial retry bodies that are read. Metadata preflight requests have their separate one-megabyte per-response caps. Retained selected JSON also has a separate 100-megabyte serialization ceiling. Returned successful-response byte counters are transport observations, not independently reconstructible original wire bytes. The evidence contains parsed selected payloads, request URLs and timestamps, their hashes, before/after preflight receipts and unchanged raw XML. Replay rechecks the semantic contract even when altered evidence has been rehashed; it does not authenticate publisher signatures or establish transactional snapshot isolation.

The normalizer preserves source `Active` status without calling it verified operation. Provider IDs remain typed source identifiers, never inferred license numbers; a missing ID stays missing with an explicit quality flag. Addresses preserve the source county label, ZIP5 and nullable ZIP4 separately. Invalid required premises/name/postal values are rejected for a future release builder to quarantine. Nullable or absent point geometry becomes missing latitude/longitude; malformed, partial or implausible coordinates are rejected, never replaced with centroids or zeroes. Bounds are only plausibility checks, not state/county polygon membership. No ownership, capacity, license dates or current USPS validity are invented.

The source policy `tn-childcare-local-review@1.0.0` keeps raw evidence internal and normalized records local-review-only. Pure function callers must supply genuine run/release/observation context from a verified release workflow; synthetic context strings are valid test inputs but not provenance proof. No record publication, recovery, scheduling or acquisition completeness is claimed by these modules alone.

Verification for this increment: 15 focused acquisition/normalization/policy tests and the full 684-test repository check passed, with lint, web/desktop builds, desktop smoke, TypeScript and a zero-vulnerability production dependency audit. Tests cover the combined acquisition-to-normalization interface, self-consistently rehashed invalid evidence, missing points and actual byte ceilings with whitespace. Independent review identified and verified the fix for an oversized-response stream cleanup fault. The previously retained real metadata receipt revalidated offline with network access disabled. No live facility data was fetched. Rollback is additive: stop using these new modules/policy; existing receipts and releases remain unchanged.

## Metadata preflight contract

Run `npm run tn-childcare:preflight` (or `node scripts/preflight-tn-childcare.mjs`). `--help` does not contact the source; all other arguments are rejected before requests. Successful receipts are written under `data/business-sources/tn-dhs-active-childcare-centers/preflights`, not a production `current.json`.

The first application-side stage is metadata-only, based on the [bounded state source assessment](states/TN-CHILDCARE-ACCESS-2026-09-07.md). It must finish before a dependent acquisition connector is enrolled. It does not download facility records, create normalized entities, publish a source pointer, enable a schedule or approve exports.

The source scope is the fixed Tennessee STS-GIS childcare layer, restricted to publisher status `Active`, provider type `Child Care` and childcare type `Child Care Center`. Family homes, group homes, drop-in centers, authorized providers and education-department facilities are not included in this initial scope. Count results describe source rows, not deduplicated or independently verified businesses.

The command accepts no caller-selected host, SQL, field list or credential. Request limits and cancellation belong to the app. Source identity, schema, CRS, terms and before/after metadata/count agreement must be checked before a successful receipt is stored. Store receipts only inside `datahub`, with observation times, evidence checksums and immutable run-specific names. A matching pair of observations is not transactional snapshot isolation.

The sequence checks layer, item, organization, publisher XML and selected count, then repeats them in reverse order. Parsed JSON payloads and their hashes are retained; XML is preserved byte-for-byte as base64 with byte length, SHA-256 and content type. XML checks are bounded UTF-8/envelope/marker checks, not a full XML parser, schema validator or proof of authentic publisher signatures. XML is never executed and its references are not fetched. Missing XML must remain an explicit gap, not an invented empty metadata file or a ready acquisition state.

Publication timing, source observation time and item/layer modification times remain separate. Neither an active-source filter nor a recent service modification proves current operation, license validity dates or all-state completeness. Retained metadata is source evidence, not automatic policy approval.

## Next gates

Publisher terms include user-assumed risk and a hold-harmless condition for Tennessee and its staff. Preserve these material conditions alongside attribution and warranty disclaimers; this implementation is not a legal determination or authority to accept a new agreement. Publisher XML carries source-purpose/scope narrative even when the item JSON description is empty. Neither empty JSON prose nor metadata-file absence should silently erase those conditions.

Bounded ID-based acquisition, privacy-selected fields, source drift detection, complete evidence retention, normalization and independent offline release replay are implemented. National registry/reporting integration remains a separate gate after a real source release verifies. Normalized records retain ZIP5 and ZIP4 separately and latitude/longitude only on business entities. Keep ownership and unique-business identity unverified and use local-review-only reporting until the integration policy explicitly allows otherwise.

The standalone application owns routine execution after those gates; no live Codex task should be required. A preflight receipt alone must not be treated as a completed acquisition, automatic crash recovery, or scheduler enrollment. Existing immutable releases and the active production rebuild are untouched by these new files.

## Execution and recovery boundaries

`tn-childcare-preflight@1.0.0` permits up to three transient attempts per observation with one-second pacing, a default 30-second deadline through body reading, a one-megabyte response ceiling and a 20,000 selected-row count ceiling. Redirects are rejected. Publisher Retry-After above the 60-second local wait budget defers rather than retrying early. CLI signals and app IPC cancellation propagate through request/read/wait operations.

The writer reconstructs and validates the receipt before storing it, checks canonical datahub paths and lossless Windows file identities, flushes complete bytes, then publishes with an exclusive hard link so an existing destination cannot be overwritten. Cancellation is checked immediately before this commit. After commit starts, an unlink or post-commit ownership-check failure can report an error while a complete receipt already exists; inspect evidence rather than assuming every exception means nothing was written. Abrupt interruption is not automatic recovery. Historical evidence is never rewritten or silently deleted.

## Verified first metadata observation

The standalone CLI completed at `2026-09-08T00:11:12.936Z` (September 7 local time). Receipt: `data/business-sources/tn-dhs-active-childcare-centers/preflights/8f174e2a-2234-408d-9018-337ce938ba7f.json`, 361,296 bytes, SHA-256 `1549d132a944d4ad85ef797ecb458426e52858bf674a7cc3ebbbddac6b967311`.

Root independently checked the receipt hash, all ten parsed-observation hashes, absence of feature/ID request parameters and both raw XML byte/hash pairs. Each XML observation is 104,930 bytes with SHA-256 `6e90fe62991c07898a09dac1aad44ab699078effc358e4532be3a99e54cab8f6`. The app reported 1,863 source records under its fixed filter, zero row-data requests, zero normalized records and no published release pointer. All acquisition, schedule and export readiness flags remain false.

This receipt is evidence that the real metadata path works, not proof of publisher authentication, XML schema validity, current operation or nationwide coverage. Next implement the bounded selected-record acquisition and independently replayable release contract using this verified prerequisite.

Verification: eight focused tests, including real child-process IPC cancellation, and the full 669-test repository check passed. Lint, web/desktop builds, desktop control-plane smoke and TypeScript passed; production dependency audit reported zero vulnerabilities. Independent review checked the source/privacy boundary and immediate pre-commit cancellation. No production implementation pin was changed. Rollback is additive: stop invoking this preflight; retained receipts and existing source releases remain intact.
