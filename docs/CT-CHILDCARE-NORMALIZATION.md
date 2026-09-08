# Connecticut normalized source candidates

This offline layer transforms a verified retained CT OEC childcare acquisition into internal source candidates. It does not acquire data, verify premises, merge businesses, update national totals or schedule refreshes.

## Candidate and geographic boundaries

The source cohort remains exactly `licensetype='Child Care Center' AND status='ACTIVE'`. ACTIVE is a credential status, not independently verified business operations. `uniquekey` remains opaque and release-scoped. Repeated credentials and licenses are retained as typed source identifiers, never used to collapse source rows.

Missing names, reported address lines, cities and state labels remain explicit gaps. A reported post-office box is not promoted to a physical premise, but its source row is retained. The publisher's Connecticut scope is separate from a record's actual state label; missing state information must not be silently filled from publisher scope. Unexpected or invalid selected values can produce a source-linked quarantine reference rather than guessed corrections.

Normalized ZIP5 and ZIP4 are separate fields, preserving leading zeroes. Malformed or placeholder ZIP values produce null postal fields and quality reasons, not lost source rows. Syntax does not establish current USPS assignment, a ZIP/ZCTA match or jurisdiction membership. Original selected values remain available as source evidence; no ZIP4 is invented.

Every geocode remains nullable and unavailable because this acquisition selects no coordinate source. No business geometry is created. Nation, state, county and ZCTA polygons stay in the governed geography datasets. Reported addresses are not marked physical-site-verified or eligible for identity matching.

## Temporal and numeric evidence

The four selected source calendar fields are `effectivedate`, `expirationdate`, `firsteffectivedate` and `credentiallastmodifieddate`. Preserve their original text and assess validity without inventing a timezone or converting them into business operating dates. Source catalog update, selected-page observation and processing timestamps are distinct provenance facts.

The four capacities are `capacityunder3`, `maximumcapacity`, `regularcapacity` and `schoolagecapacity`. Preserve each raw source value alongside a safely parsed nonnegative integer or a reason it is unavailable. Do not round decimal values or coerce unsafe integers. Credential identifiers remain strings even when their source datatype is numeric.

## Immutable derivation and reuse

Each accepted candidate and quarantine reference links to its source key, source release, ingest run, selected-page observation, transformation version and selected-input hash. Field lineage identifies source and derived fields. Accepted plus quarantined counts must equal the verified acquisition count; missing-field summaries do not become national completeness percentages.

The writer independently verifies acquired evidence, binds its manifest path/hash/run, and publishes normalized JSONL, quarantine JSONL and a summary beneath an immutable UUID. Offline verification replays the transformation and compares the complete artifacts, not just caller-supplied hashes. The acquired input is checked again before completion. Existing acquisitions and previous normalized releases are preserved.

Default output is `data/business-sources/ct-childcare/normalized`. Explicit reprocessing uses retained source evidence and makes no network requests. Source links are canonical local paths; relocating an isolated bundle does not make it self-contained. Publication uncertainty requires inspection rather than automatic retry. Cancellation removes only owned incomplete output, preserving unrelated files and acquired inputs.

```powershell
node scripts/reprocess-ct-childcare.mjs --acquired <absolute-acquired-manifest> --output <absolute-output-root>
node scripts/verify-ct-childcare-normalized.mjs --manifest <absolute-normalized-manifest>
```

The output argument is optional. The reprocessing command also supports the exclusive `--verify <absolute-normalized-manifest>` mode. No command accepts a source URL or starts a download.

## Remaining application handoff

The tested normalization layer is a prerequisite to the standalone CT worker. The worker must bind acquisition and normalized receipts, enforce source/resource reservations and cancellation, and support retained-input reuse. Then Co*Tive can accept collection through a real operation ID and receipt, freeing agents for other sources. No facility download or recurring schedule is implied by this normalization implementation.

The handoff review calls for fixed native and explicit retained entry points, CT-wide publisher exclusion in addition to output ownership, durable start/acquired/normalized/terminal receipts, a bounded application deadline, and managed cancellation grace. The normalized manifest binds acquisition execution mode as well as its path/hash/run; future app verification must check all four. Source-candidate counts must not be presented as verified physical-site counts.

Rollback stops using this derivation entry point. Preserve acquired and derived evidence; no source-current or national pointer is replaced here.

## Verification — September 8, 2026

Eight focused groups passed with synthetic data only. A 501-row two-page acquisition conserved all source candidates, including repeated credentials and missing fields. A separate retained three-row acquisition produced two candidates and one size-limit quarantine reference. Tests checked exact postal splits, all four calendar/capacity fields, source omission versus null, invalid scalar/scope rejection, chronology, cancellation, source conservation, immutable output, full replay, mode/hash substitution rejection and both offline CLIs. No source facility download occurred.

The full `npm run check` passed: 1,250 tests, 1,239 passed, 11 explicitly skipped and none failed. Lint, web/desktop builds and desktop control-plane smoke passed. Type checking passed, the production dependency audit reported zero vulnerabilities, and all 82 pending production pins were unchanged. Evidence log: `data/tmp/ct-childcare-normalization-full-check.log`. The app was restored and returned HTTP 200. These checks establish the implemented derivation behavior, not live CT collection or complete national business coverage.
