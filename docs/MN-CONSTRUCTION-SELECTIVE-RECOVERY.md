# Minnesota registrations: selective investigation and recovery

## Retained evidence, September 8, 2026

The managed operation `a01b1819-420b-4036-a5fb-40f9c29ba861` contains independently successful residential work and failed registrations work. The residential acquisition remains enrolled and reusable. Do not rerun the entire construction/MN industry merely to investigate registrations.

The registrations app job `aa5ef9b0-4684-4496-b5ae-501c49a7e4e3` ended `FAILED` with `acquisition: null` and the historical diagnostic `source-csv-invalid`. Its saved schema preflight observed a 4,408,602-byte registrations source with ETag `"06cd86f3fdd1:0"`. This describes that observation, not the current publisher version. No completed selection or normalized manifest exists for that job.

Its retained partial selected stream contains 11,751 contiguous frames (8,145 accepted dispositions and 3,606 rejected dispositions), 2,792,210 bytes, SHA-256 `8cdd878d1d943c018032194c435a6f0c3e8e42df5963a390114fc29feb85e0c6`. Only counts and checksums were inspected for this follow-up; no names, addresses, contacts or raw parser messages were printed. These are partial frames, **not verified acquired records or additional coverage**. They cannot prove source completion, the exact offending source row, or the specific CSV syntax error. Raw source bytes were not retained, so the precise failure cannot be reconstructed from this history alone.

## More actionable, still redacted diagnostics

Future app failures can distinguish:

- `source-csv-column-count`: inconsistent CSV field/column count;
- `source-csv-unclosed-quote`: quoted field not closed at end of input;
- `source-csv-opening-quote`: invalid quote within an unquoted field;
- `source-csv-closing-quote`: invalid characters after a closing quote;
- `source-csv-record-limit`: the existing 65,536-byte-carrier-character record limit;
- `source-csv-header-mismatch`: unexpected header columns.

Only known `CsvError` types and fixed code mappings are interpreted. Arbitrary transport or sink errors cannot select a parser code by setting their own `code` property. Parser messages, record values, field names, paths, stack context and causes are not copied into the app diagnostic. Existing generic diagnostic codes and old sidecars remain valid; they are not retroactively assigned a more specific cause.

This change does not relax CSV quoting, skip malformed records, guess an encoding, increase limits, or turn partial output into a release. A failed job still fails. Selection receipt versions and successful residential evidence remain unchanged. Diagnostics remain advisory local failure metadata, not independently authenticated publisher evidence.

## App-owned next action

Manual source selection can narrow an industry operation to the registrations source without changing the enrolled industry configuration. Source selection is not automatic retry, freshness deduplication, or a claim that the parsing defect is repaired. The app must still execute all policy, publisher-lock, schema, transfer, cancellation and verification checks. Its existing schema prerequisite inspects bounded prefixes of both exports; selecting registrations prevents a full residential download, not every residential prerequisite request.

Any new investigative acquisition requires its own managed operation ID and persisted receipt. Do not poll routine acquisition from an agent slot. Inspect the resulting failure only when a concrete recovery issue requires work. Preserve all prior failures and the successful residential release. National business totals and ZIP coverage must not include incomplete registration frames.

## Actual selective handoff

After full validation, the restored local app returned HTTP 200 for a plan containing exactly one task: `state-mn-contractor-registrations:MN`. The same explicit source selection was dispatched once through the authenticated collection API, which returned HTTP 202:

- Managed operation: `81a6f52f-555a-4683-8a46-b9da7597f182`.
- Created: `2026-09-08T13:49:14.743Z`.
- Status at acceptance: `RUNNING`.
- Persisted managed receipt: `data/managed-operations/81a6f52f-555a-4683-8a46-b9da7597f182/receipt.json`.
- Receipt snapshot SHA-256 at handoff: `6a7479d2a8e6b19370c885e21bb506f56ac2df1e6402ee1f62cc9e6b762520d8`.

The receipt's selected source and one-task scope were checked immediately after dispatch. This hash describes that mutable managed-receipt snapshot, not its eventual terminal contents. The prior residential receipt was independently reverified as `SUCCEEDED` with unchanged SHA-256 `ae0dfe3d93e2edf7d19303774b3ac922c9ff423c56d930138fd313d86468e3eb` before dispatch. No second residential builder was selected. Terminal outcome was deliberately not polled during this handoff; acceptance is not proof of successful registrations acquisition or a CSV repair.

Validation: `npm run check` passed (1,089 tests passed, 11 skipped, zero failed), including lint, builds and desktop smoke. `tsc --noEmit` passed; `npm audit --omit=dev` found zero vulnerabilities. Focused tests cover specific redacted parser failures, historical generic diagnostics, strict source selections, selected-task receipts and locks, CLI forwarding, and unchanged schedule rejection of source-level inputs. Two bounded peer reviews found no concrete defects. Rollback removes manual selection and the new diagnostic mappings after checking active operations; never delete run history or the successful residential cohort.

## Verified outcome and exact-version hold

The selective operation subsequently ended `FAILED` at `2026-09-08T13:49:29.686Z`. It ran only registrations. Its app job `03b4a883-610a-4747-8648-5eccf82df553` independently verifies as `FAILED`, with no completed acquisition and diagnostic `source-csv-closing-quote`. This identifies malformed CSV closing-quote syntax, not a safe correction or a verified offending business record.

Evidence under that job directory:

- `receipt.json`: SHA-256 `8e38fe4766558d2cccf175b8e8eb013a31da0bca22f91d6116448cbf4bc7ceb8`.
- `diagnostic.json`: SHA-256 `740bd8ba3bf224bb6dd2143c1a9f34d67d8cd85504504ccabf9023aa74a8ae28`.
- `schema-preflight.json`: SHA-256 `7c0ffeee731a2b105823fccc2101657cf722c386fed1ad399245cc63c985e2c5`.

The registrations export still had observed ETag `"06cd86f3fdd1:0"`. A reviewed operational hold in `runner/mn-construction-source-holds.mjs` now rejects transfer of that exact registrations version with `source-version-held`. The fixed export's preflight is validated first; no full-export request or selected bundle is started. App invocation may still perform its paced notice/schema prerequisite requests before discovering the hold, and persists a failed-job diagnostic. The hold does not activate a recurring probe or retry.

The other cohort is not held, even if a publisher reused the same ETag on its separate resource. Changed registrations ETags remain subject to every ordinary policy, transfer, strict CSV and verification check; a changed tag is not proof that malformed data was repaired. Incidental content-type changes cannot bypass the same held tag. The hold does not affect offline replay or historical receipt verification, and does not need local copies of the failed source artifact to remain effective on another checkout.

Using the actual saved preflight, the transfer entry rejected with `source-version-held` and zero fetch calls. The successful residential job was independently reverified with its unchanged SHA-256. Isolated app tests cover prerequisite-only requests, no full export, no selected bundle, persisted hold diagnostic, and publisher-lock release. This is not a new live acquisition or proof of current publisher state. Retire the reviewed hold only after a verified source/parser correction; preserve its evidence in Git and do not loosen quotes or guess fields merely to clear it.

Hold/Delaware transport increment validation: `npm run check` passed with 1,100 tests passed, 11 skipped and zero failures, including lint, web/desktop builds and desktop smoke. Type checking passed; production dependency audit reported zero vulnerabilities; all 82 pending production code/configuration pins remained unchanged. The local preview was restored and returned HTTP 200. No acquisition or national promotion was dispatched in this increment.
