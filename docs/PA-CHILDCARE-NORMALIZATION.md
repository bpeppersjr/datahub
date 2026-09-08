# Pennsylvania normalized facility evidence

This layer transforms a verified retained Pennsylvania childcare acquisition into an immutable, internal facility-candidate dataset. It never downloads data, replaces a source pointer, matches entities or adds records to national totals.

## Data boundaries

Every source row must resolve to either an accepted facility candidate or a source-linked quarantine reference. Missing or malformed ZIP values alone do not remove a facility: ZIP5, its postal alias and ZIP4 become explicit nulls with a reason. Valid ZIP extensions are separate four-character fields; leading zeroes are preserved. Syntactic ZIP validity is not proof of current USPS assignment or ZCTA membership.

Business records contain latitude and longitude from the publisher's address point, not polygons. Missing points remain nullable geographic gaps. Coordinate range checks do not verify address accuracy or jurisdiction membership. Nation, state, county and ZCTA polygons remain in the governed geography datasets.

Usable facility name, street, city and Pennsylvania state information are required for a physical-facility candidate. Missing required address fields, conflicting state scope or a post-office-box address produce quarantine references rather than guessed premises. Exact source `PA` or `Pennsylvania` can normalize to `PA`; the source label remains available. County and FIPS source values remain unverified publisher labels, not geometry assignments.

Provider/location indices and license numbers are typed external identifiers, not canonical business identities. The publisher's monthly-list membership does not independently establish active operations, unique ownership or complete industry coverage. Capacity source text stays separate from a safely parsed integer; unsupported numeric representations remain source text with a quality reason. Source license date strings do not become business operating dates or UTC observations.

## Provenance and conservation

Each accepted record and quarantine reference retains its source location key, source-release and ingest-run identifiers, selected-page observation timestamp, processing timestamp, transformation version and selected-input hash. The catalog's source-update time is kept distinct from the observation time. Field lineage links output fields to their selected source fields and identifies derived values.

The acquired manifest is independently verified before transformation. Its exact path, hash and run identity bind the normalized release to the retained input. The output stores normalized JSONL, quarantine JSONL and a conservation summary under a fresh UUID; its manifest publishes last. Offline verification replays the transformation against the verified input and compares all generated artifacts and source linkage. A changed source or merely rehashed substituted output cannot pass by checksum alone.

## Operation and reuse

`node scripts/reprocess-pa-childcare.mjs --acquired <absolute-acquired-manifest> [--output <absolute-output-root>]` builds locally. `node scripts/reprocess-pa-childcare.mjs --verify <absolute-normalized-manifest>` verifies locally. Neither command accepts a source URL or dispatches acquisition. Paths must stay within `datahub`, and output cannot be nested inside an immutable source bundle.

The default output root is `data/business-sources/pa-childcare-centers/normalized`, with immutable `jobs/<UUID>` releases. Explicit reprocessing can create another derived release while preserving both the acquired source and existing normalized releases. Cancellation cleans only owned incomplete output before publication; uncertain publication remains for inspection. Do not automatically retry uncertain publication or delete retained source evidence.

Source links use canonical local paths. Moving a bundle alone to another machine does not make it self-contained: relocation/export needs a separately verified dependency relocation process. Public redistribution is not authorized by this internal-use profile.

## Application handoff

Normalization and acquisition are separate so downstream repairs can reuse saved source evidence. The end-to-end Co*Tive worker now records start, acquired-input, normalized-output and terminal receipts, uses native publisher exclusion, and supports explicit retained-input reuse. See [standalone application handoff](PA-CHILDCARE-APP.md). Enrollment alone is not a completed handoff: a real app operation ID and persisted receipt are required before routine collection is considered transferred to the app.

Rollback: stop using this new derivation entry point; no existing source or national pointer changes. Preserve completed source and derived releases for audit and reuse.

## Verification evidence — September 8, 2026

Nine focused tests passed using synthetic source data. A 501-row cohort conserved 498 accepted records and three quarantine references. Persistence tests built a separate three-row acquisition into two accepted facilities and one quarantine reference, verified two distinct derived releases and the offline CLI, and confirmed unchanged source bytes. Altered acquired data, rehashed normalized substitutions, extra files, unsafe output paths and conflicting ownership were rejected. Cancellation after creating an output job removed only that job's owned incomplete files and preserved the source and an unrelated marker.

These tests do not represent a live Pennsylvania facility download. The actual source evidence currently remains the separate metadata/count preflight; no new managed operation or national completeness claim is made here.

The full `npm run check` passed with 1,215 tests: 1,204 passed, 11 explicitly skipped and none failed. Lint, web/desktop builds and desktop smoke passed within that check. TypeScript passed, and the production dependency audit reported zero vulnerabilities. The log is `data/tmp/pa-childcare-normalization-full-check.log`. All 82 code/configuration pins for the separate pending national rebuild remained unchanged.
