# Minnesota construction schema prerequisite

Run `node scripts/preflight-mn-construction.mjs` from the datahub folder to inspect the two fixed DLI construction exports. No URL, header, credential, file-selection or output-path override is exposed by the command. This is a bounded schema prerequisite, not a business acquisition job, schedule or production source.

## Observed native result

The live check on September 8, 2026 succeeded with six serial requests: HEAD, 4,096-byte range GET, HEAD for each of the publisher-linked contractor-registration and residential-contractor exports. The complete header of both files is 176 bytes with SHA-256 `42656fca145747700de73dc3040cc24942b5d3b8c74bdfff6ad851391e4cab83`. Those exact 18 column names are now the pinned prerequisite contract:

`Bus_Pers`, `License_Type`, `License_Subtype`, `Name`, `DBA_Name`, `Addr1`, `Addr2`, `City`, `St`, `Zip`, `Phone_No`, `Email_Address`, `Lic_Number`, `Status`, `Orig_Date`, `Exp_Date`, `Enforcement_Action`, `Renewal_in_Progress`.

Receipt: `data/business-sources/mn-dli-construction/preflights/7a3b1fc7-e9d0-44ce-95a1-f5da26821d43.json`, 3,065 bytes, SHA-256 `99be9c6a4e8e55baa4d18d6c9df54b080c8bc411169ce33c76904c997af1f377`. Observation times are 10:35:49.005Z and 10:35:52.781Z. The saved native receipt reconstructs under the final verifier. Source headers now report September 8 modification times and sizes 4,408,602 and 12,184,840 bytes respectively; earlier [HEAD observations](states/MN-CONSTRUCTION-ACCESS-2026-09-08.json) remain historical, not overwritten.

The two prefixes consumed 8,192 bytes in memory. They may include record bytes after the header, which were neither parsed nor retained. Only header bytes and bounded source-header fields appear in the receipt. No full export, business names/addresses/contact values, source-record count or national coverage measure was produced. Header field names are not values or a business/person codebook.

## Runtime and proof boundaries

- Fixed publisher-linked URLs, credential omission, redirect rejection and one-second serial pacing. There are no automatic retries: provider errors, including 429, stop without another request or reading error bodies. This prerequisite does not shorten a publisher cooldown.
- Fifteen-second request deadlines by default cover ignored header signals and stalled body reads. Late responses are cancelled. Trusted code-level test options can shorten deadlines but cannot select another URL or increase the fixed prefix size.
- HEAD requires a bounded file size, a strong ETag, a modification timestamp and an accepted content type. Range GET must return exactly HTTP 206, `bytes 0-4095/<known-size>`, exactly 4,096 consumed bytes and matching source validators. Encoded and multipart/incorrect ranges are rejected. An HTTP 200 response is cancelled unread, not treated as permission to fetch the complete file.
- HEAD/range/HEAD comparisons detect observed changes, not cryptographic identity of the unconsumed full file. ETag, modification date and advertised length do not establish row freshness, a transactional snapshot or source authenticity.
- Only the terminated first CSV header is decoded as strict UTF-8, so an incomplete multibyte character in discarded row bytes cannot corrupt header inspection. The narrow grammar supports quoted columns but rejects multiline headers, empty/duplicate/formula-like names and changes to the pinned column roster. Unsupported headers stop for review instead of being silently normalized.
- Receipt validation reconstructs header bytes, hashes, columns, source identity, fixed URL roster, chronology and non-acquisition claims. It does not authenticate the publisher independently or verify a checksum of bytes that were deliberately not retained.

## Receipt storage

The CLI writes a unique immutable JSON receipt under `data/business-sources/mn-dli-construction/preflights`. The writer snapshots validated evidence before asynchronous work, checks canonical app-contained non-aliased paths, and refuses manifest-bearing or reserved release/staging ancestors, including mixed-case Windows variants. Exclusive temporary creation, byte verification, filesystem ownership checks and no-overwrite publication preserve previous receipts.

Cancellation before the publication boundary removes only an owned temporary file; ordinary failed temporary evidence remains for diagnosis. The link/unlink publication pair is a cooperative commit boundary. A process termination or disk failure can still require manual inspection of incomplete publication; automatic crash recovery is not claimed. A returned JSON path denotes accepted publication, not an acquired dataset. The writer has no production-pointer effect.

## Remaining acquisition gates

The observed `Bus_Pers` column makes a business-only filter plausible. The later bounded code profile below observes literal values, but does not establish their complete semantics. Do not infer them from the column name. Verify credential/type/status codebooks, license-to-business/location relationships, address role, date semantics and source use before creating a native connector. Presence of `Phone_No` and `Email_Address` confirms that contacts must be excluded from the future field allowlist, not ingested merely because the export includes them. Enforcement and renewal information need explicit treatment and are not verified current-operation flags.

No coordinate columns are present. Future geocodes must come from an authorized, provenance-preserving address process; do not fabricate points or attach polygons to businesses. Normalize `Zip` into separate ZIP5/ZIP4 fields while preserving unknowns. Broad Minnesota industry coverage, a unique-business denominator and business matching remain unproven.

The bounded code prerequisite is now implemented below. Next resolve remaining semantics and reviewed source policy, then run-isolated acquisition retention, normalization/quarantine conservation, independent verification and native Co*Tive job receipts. Routine downloads belong to the app after that handoff; retain and reuse verified source bytes for subsequent promotion.

## Aggregate code prerequisite (schema 2)

`node scripts/preflight-mn-construction-codes.mjs` uses the same six-request, two-prefix limits. It retains only predefined aggregate buckets for `Bus_Pers`, credential prefix and `Status`. Unselected fields are not accumulated; unknown values are counted without storing their text or hashes. Complete selected fields are discarded after counting. Incomplete trailing records are discarded, including non-ASCII or overlength selected values; malformed complete selected codes fail with fixed redacted diagnostics. This is not a full acquisition or app enrollment.

Native receipt `data/business-sources/mn-dli-construction/preflights/bbc5eea1-2bac-4d71-bcae-4178c344c78a.json` is 5,293 bytes, SHA-256 `044ef6a7b803533af98e615de257cd5c648bb8f13270c7cdde85989c6c2f1287`. On September 8, 2026 at 10:45:13.417Z and 10:45:17.154Z respectively:

- Contractor registrations: 18 complete prefix records, all literal `Business` and `IR`; 14 `Issued`, four `Expired`.
- Residential contractors: 17 complete prefix records, all literal `Business` and `RR`; 12 `Issued`, three `Expired`, two unknown status codes whose text was not retained.

Both prefixes discarded an incomplete tail. These nonrepresentative observations are not unique-business counts, statewide totals, active-business percentages or evidence of an operating address. The source contains non-Issued records; a future active-credential filter cannot accept all rows. Address role and complete codebook semantics remain unresolved. No names, addresses, contacts, full identifiers or source rows were retained.

Schema 1 retains its existing exact-header contract and header-only scope. Schema 2 adds exact bucket shapes, conservation and explicit `counts_independently_replayed: false`: replay validates the receipt's structure and totals, not counts against discarded source rows. Both saved native receipts validate offline without repulling data. Six additional offline tests cover privacy, unknown/blank buckets, incomplete selected fields, CSV framing, invalid codes, conservation and the native request itinerary. Peer review found the incomplete selected-field edge case, corrected before release.

Schema-2 verification on September 8, 2026: all 993 tests, lint, web/desktop builds and desktop control-plane smoke passed in `npm run check`; `npm audit --omit=dev` reported zero vulnerabilities. All 80 production code/configuration pins remained unchanged. Local preview was restored with HTTP 200, without browser visual QA. Full-check log: `data/tmp/mn-construction-codes-check.log`. Rollback removes the new profile module, CLI and tests and reverts the schema-2 additions; retain both historical receipts as evidence rather than silently relabeling schema 2 as schema 1.

Ten offline tests cover the request sequence, parser/privacy boundaries, source drift, unknown columns, bad ranges/encoding/sizes, provider failures, ignored signals/stalls/late replies, cancellation, replay forgery, receipt snapshots and path/publication controls. Rollback removes this prerequisite module, CLI and tests, while keeping retained evidence. No source policies, industry enrollment or schedules changed.

Verification on 2026-09-08: `npm run check` passed all 987 tests, lint, web/desktop builds and desktop control-plane smoke. `npm audit --omit=dev` reported zero vulnerabilities. The native receipt above was reverified after the schema pin was added. Independent review identified the mixed-case Windows ancestor restriction, which was corrected and regression-tested before the full check. All 80 code/configuration pins of the existing Ohio production plan stayed unchanged. Local preview restored with HTTP 200; no browser visual QA performed. Full-check log: `data/tmp/mn-construction-preflight-check.log`.
