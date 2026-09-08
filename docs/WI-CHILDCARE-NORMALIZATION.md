# Wisconsin childcare normalization

`runner/wi-childcare-normalization.mjs` converts validated selected-source features into local-review business records. It performs no network requests, geocoding, matching, policy acceptance, release publication or scheduling. Live Wisconsin acquisition remains disabled pending the source-use decision and complete worker/release implementation.

## Record contract

Source provider, location and facility identifiers remain separately typed strings, with leading zeros preserved. They are not license-number or canonical-business assertions. Source-record identity is release plus OBJECTID; duplicate provider IDs, names or addresses do not cause records to be merged. Business names and address strings are trimmed, while exact input-feature hashes link back to unchanged acquisition evidence.

Normalized `zip_code` and `postal_code` contain the same ZIP5; `zip4` is a separate nullable four-digit field. ZIP5, hyphenated ZIP+4 and compact nine-digit input are split without numeric coercion. The normalized record contains no joined ZIP value. Null/blank input becomes a missing-source ZIP gap. Zero-like and other malformed strings become explicitly classified unavailable ZIPs while preserving an otherwise usable physical premises record. This is a deliberate processing rule, not evidence Wisconsin actually emits those values. Unsupported types, excessive lengths and control characters are rejected rather than silently repaired. Current USPS assignment is not established by format validation; no ZIP is inferred from coordinates or ZCTA.

Name, street, city and Wisconsin state are required; street2 is optional. Recognizable PO-box/general-delivery addresses and invalid required content go to quarantine. No street-number heuristic or claim of nonresidential premises is introduced. Capacity remains a nullable nonnegative integer, with zero distinct from missing.

Business geocodes contain only latitude/longitude and their evidence labels, never polygons. Missing, empty, zero-location, out-of-range or out-of-area points preserve the specific acquisition-core reason with a paired null result. Malformed coordinate structure or conflicting CRS is rejected. The broad Wisconsin plausibility envelope is not a governed boundary or verified address. County, parent company, ownership, independent operating status and validity dates remain unknown rather than inferred.

## Provenance and conservation

Each record carries run/release IDs, source OBJECTID, input hash, fixed layer/filter, attribution, transformation version, installed policy identity/hash and field lineage. `observed_at` is the selected page's original observation; `processed_at` is a separately supplied canonical processing time. Batch processing cannot predate final acquisition evidence. Reprocessing keeps the observation unchanged instead of implying renewed source freshness. Publisher metadata clocks remain available in acquisition evidence and are not copied into invented operating dates.

Batch normalization first replays the complete acquisition evidence. Every selected source OBJECTID appears exactly once in accepted records or quarantine; their counts conserve the selected source total. Quarantine retains ID, source/run linkage, feature hash, observation/processing times, transformation/policy hash and a bounded reason—not copied sensitive values in error messages. Raw features remain in acquisition evidence. Structural acquisition failures stop the batch rather than being disguised as record-level quarantine.

Summary counts separate accepted, quarantined, ZIP5-present, ZIP4-present, missing/invalid ZIP reasons and coordinate-gap reasons. No identity matching, source-use authorization, export permission or publication is implied. These are source-record counts, not unique businesses or a national completeness denominator.

## Evidence and remaining work

Eight new synthetic tests cover split postal fields/leading zeros, padded and nullable values, typed IDs, point gaps, rejected text/address/capacity/scope/CRS, safe contexts, exact accepted/quarantine conservation, duplicate identifiers, deterministic reprocessing, source/evidence failures, cancellation and processing-time chronology. Shared acquisition fixtures moved to `runner/fixtures/wi-childcare-acquisition.mjs`; they contain no actual facility records.

Verification: `npm run check` ran 822 tests, with 821 passing and the known preview-conflicting lifecycle test failing. After the build and graceful preview stop, both lifecycle tests and all 30 final Wisconsin tests passed together (32/32), including the newly added final-acquisition chronology regression. That covers 823 distinct tests across runs, not one clean full-check exit. Lint, TypeScript, final web/desktop builds, desktop smoke and production audit passed (zero reported vulnerabilities); preview was restored with HTTP 200. Logs: `data/tmp/wi-normalization-full-check.log`, `wi-normalization-focused-check.log`, `wi-normalization-desktop-check.log` and `wi-normalization-final-build.log` in that directory. A parallel read-only review identified and verified the processing chronology fix. All 40 production code pins remained unchanged.

No actual Wisconsin business release has been built or published. Still needed: the source-use decision, bounded live acquisition, immutable release assembly and independent verification, app-worker enrollment and actual accepted handoff. The pending policy is not changed by successful offline normalization.

Follow-up: [offline immutable bundle assembly and verification](WI-CHILDCARE-RELEASE.md) are now implemented and tested with synthetic evidence. This does not establish an actual publisher-derived Wisconsin business release, change source-use authorization or enroll live collection.

Rollback removes the new normalizer/tests and restores inline acquisition fixtures if desired. No source pointer, schedule, retained business data or production-pinned implementation was changed.
