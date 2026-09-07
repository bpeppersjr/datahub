# New Jersey childcare connector development

The application-side preflight checks the fixed public NJDEP source described in the [source handoff](states/NJ-CHILDCARE-ACCESS-2026-09-07.md). Its CLI remains metadata-only. The separate build and verification commands implement the source-release workflow; this does not imply national registry integration, record-level export approval or an enabled refresh schedule.

## Standalone release commands

```powershell
npm run nj-childcare:build
npm run nj-childcare:verify -- <immutable-manifest-path>
```

The build command accepts only an optional `--output` path inside `datahub`. Source URLs, queries and resource limits cannot be overridden through the CLI. Verification requires a release's `manifest.json`, not `current.json`, and replays retained evidence locally without downloading. Both commands support cooperative app IPC and process-signal cancellation. Help and invalid arguments do not acquire data. A successful build is a source release, not a verified count of currently operating businesses.

Each immutable release contains selected features, normalized records, quarantine, complete source observations and byte-preserved `publisher-metadata.xml`. Its manifest links all five artifact checksums, policy, source-release identity, transformation and counts. The verifier reconstructs fixed acquisition requests against retained observations, checks XML linkage and reruns normalization. It rejects self-consistently rehashed evidence that violates source/schema/privacy rules; it does not authenticate publisher signatures or establish current operations. At least one accepted record and no more than 5% quarantine are required; source-scope/private-field drift fails the entire release.

Publication uses an exclusive lock, owned UUID staging, flush-before-rename and a manifest written last. Cancellation before commit removes only owned staging; ordinary failures retain completed acquisition evidence for inspection. After the immutable release rename begins, the pointer commit finishes without cooperative interruption. Existing releases remain intact. Exact bigint file IDs are used for ownership comparisons on Windows. Abrupt termination or disk failure can leave a lock or an unpointed release; automatic crash recovery and acquisition resume are not implemented, and locks are never silently reclaimed.

## Managed industry handoff

### Verified first acquisition

App run `nj-app-acquisition-20260907-01` completed successfully at 2026-09-07T20:05:27.830Z. Release `nj-childcare-cb963752-d6bb-49bd-aeb3-916f169cb5de` retained all 4,075 selected source rows, accepted 3,952 and quarantined 123 (about 3.02%, below the 5% gate). A separate verifier invocation replayed all five artifacts successfully; manifest SHA-256 is `2e66cc8db58c91e24f46ecd85d151f85f95b69971aef12821a9f5768df4aa2a2`. The receipt SHA-256 is `c9ba557d72cba3d28c576a9fc01e56c628d20df1dc8129a162983a39ef9740e4`. Root review also matched the worker log hash and pointer/manifest hash, confirmed empty staging and released publication lock, and observed the worker had exited.

The five artifacts total 16,242,115 bytes. All 3,952 accepted records have publisher coordinates; none contains a supplied ZIP+4, so that separate field remains null. These are source records, not independently verified unique or operating businesses. Production reporting and national completeness remain unchanged.

Local diagnosis of retained selected rows found all 123 quarantine records failed the strict text check in the optional `sessions` field due to U+000A linefeeds. No missing names, addresses or postal fields were identified as that rejection cause. Do not silently discard the source rows, loosen address/identifier validation globally or redownload them. Next is explicit transformation-version dispatch and sessions-only LF preservation followed by offline reprocessing from retained evidence, preserving the original release and its verifier compatibility. Other fields and control characters must keep their existing rules. The initial release remains valid under its declared transformation.

The `childcare` industry has a separate `state-nj-childcare` source, limited to NJ and independent of MA. Its connector and policy versions are `nj-licensed-childcare-centers@1.0.0` and `njdep-childcare-local-review@1.0.0`. The app's industry worker executes the same standalone builder with a run-scoped output, source reservation, cooperative IPC cancellation and durable receipt/log hashes. No Census acquisition is a hidden prerequisite.

```powershell
npm run industry:plan -- --industry childcare --state NJ
npm run industry:run -- --industry childcare --state NJ --run-id <new-run-id>
```

Planning does not download data. An explicit run can acquire the source again; there is no automatic freshness-based skip or resume claim. Shared national downloads remain reusable separately. NJ's reporting profile remains unmeasured until registry/coverage integration; neither enrollment nor its source row count changes the national completeness percentage. Public-school facilities remain included under NJ's source scope, unlike MA. No recurring refresh schedule is enabled by enrollment.

Release/enrollment verification passed all 626 repository tests, source/connector checks, lint, web/desktop builds, desktop control-plane smoke and TypeScript. The production dependency audit found zero vulnerabilities. Tests include the real industry-worker subprocess with offline transport, XML preservation/tampering, unsafe rehashed evidence, source-scope failure, cancellation and foreign lock/staging preservation. No production migration is required. Removing the enrollment only removes that future task from plans; retained releases remain available and must not be deleted as part of rollback.

## Command and retained evidence

```powershell
npm run nj-childcare:preflight
```

`--help` performs no source requests. Other CLI arguments are rejected; callers cannot replace the source host, layer, query or output path. The command saves a UUID receipt under `data/business-sources/nj-licensed-childcare-centers/preflights` and prints only its path, checksum, size, count and readiness summary. It uses no AI session or credentials.

Eight paced observations check layer metadata, public catalog-item identity, total count and download-date aggregates in forward/reverse order. No object-ID inventories, record attributes or business geometries are requested. Aggregate JSON contains a statistics row, not a business entity. Requests have a 30-second header/body deadline, three bounded transient attempts, a one-megabyte response ceiling and one-second observation spacing. Publisher waits above 60 seconds defer instead of being shortened. Redirects and caller-supplied transport/query extensions are rejected; test-only transport/clock/timeout injection is bounded.

The layer schema pins 21 selected field names/types/lengths without acquiring their values. Its MapServer catalog omits nullable flags and objectIdField; the OID field identifies OBJECTID. Native Web Mercator identifiers, query/order/pagination/statistics capabilities, source count and a single non-null download date must remain consistent. Counts above 20,000 fail the local preflight ceiling. Item ownership, public access, type, source URL, dates and terms are checked. Variable item-view statistics are retained but not used as source-drift evidence.

Preflight receipts preserve all observed layer/item JSON payloads, including distribution terms, and their parsed-payload hashes. Treat retained metadata/HTML as untrusted source evidence, not executable markup. This metadata-only CLI does not retain publisher XML; its receipt explicitly records that requirement for acquisition. Terms presence does not establish legal approval. Preflight alone publishes no current dataset pointer and leaves connector_ready, scheduled and export_authorized false; the separate release workflow supplies the stronger acquisition evidence.

## Failure and semantics

Malformed/oversized bodies, changed identities/schemas/counts/dates/terms, mixed or null aggregate dates and insufficient capabilities fail without a successful receipt. CLI cancellation propagates through IPC and process signals to requests and waits. Receipt publication uses exclusive temporary files, flush-before-rename and ownership checks; failed cleanup must preserve foreign paths, prior receipts and unrelated data. There is no automatic stale-data deletion or resume claim.

Publisher download and item modification dates remain distinct from observation time and license validity. Stable checks do not establish a transactional snapshot, current operations, unique business identity or complete childcare coverage. New Jersey's public-school inclusion differs from Massachusetts; do not treat the sources as identical denominators.

Next: acquire and verify a first live release through the enrolled app worker, then integrate retained records into the national registry without repulling them. Business entities contain latitude/longitude only, and ZIP5/ZIP4 remain separate. No production data migration is required for the additive source workflow.

## Source normalization

`normalizeNjChildcareFeature(feature, context)` is a pure transformation with explicit run/release identity, canonical UTC observation time, WGS84 output and expected publisher download-date context. It rejects undeclared or missing attributes, out-of-state records, invalid identifiers/dates/capacities, postal-box-only primary addresses and malformed postal values rather than repairing or guessing them. Missing source coordinates remain null; present coordinates must pass CRS and a broad NJ plausibility envelope, which does not prove geographic boundary membership.

The normalized record preserves the DCF center identifier as a string, ZIP5 and ZIP4 separately, nullable source license dates, source capacity and operational descriptors. FOIPS values remain source strings, not inferred booleans or ownership. Publisher download dates are distinct from observation time. Active-layer membership does not establish current business activity, occupancy, renewal validity, unique business identity or nationwide completeness. No parent company is inferred, and there is no cross-release closure detection or cross-source entity merging.

Business records contain latitude/longitude only, with source geocoding descriptors; retained input features will remain internal evidence. Every record hashes its input feature and carries run/release identity and transformation `nj-childcare-normalization@1.0.0`. Outputs stay `local-review-only` and explicitly require publisher metadata and the derived-publication notice. This transformation does not itself persist the required metadata, approve exports, create a registry contribution or publish a release.

## Acquisition handoff contract

`acquireNjChildcare()` now implements the bounded in-memory acquisition stage with fixed source URLs and transport/clock/cancellation injection only. It returns sorted selected `features`, complete JSON `source.observations`, source identity/date/CRS evidence, and before/after raw XML in `publisher_metadata`. XML observation hashes refer to those raw bytes, whereas JSON observation hashes refer to serialized payloads. No CLI, filesystem publication, resume or industry enrollment is provided by this module.

Feature batches are greedily packed within both 100 IDs and 2,000 encoded URL bytes. Each JSON response is capped at 8 MB; cumulative serialized selected responses are capped at 100 MB. This is an evidence-byte budget, not a process-RSS guarantee. Three bounded transient attempts, a 30-second header/body deadline, one-second observation spacing, publisher Retry-After deferral and cancellation are enforced. Exact selected attributes, scalar-only values, ID coverage, source-date consistency and WGS84 response/feature CRS are checked before successful return. Invalid scalar record values are left for normalization/quarantine; nested objects and undeclared/private fields fail acquisition.

Verification for acquisition and normalization: nine acquisition tests (including actual cumulative-byte overflow and stage integration) plus six normalization tests passed. Full repository checks passed 610 tests, lint, web/desktop builds and desktop smoke; TypeScript passed and the production dependency audit found zero vulnerabilities. The final nested-value guard was followed by all 15 focused tests and scoped lint. All feature acquisition in this increment used offline fixtures, not a live bulk pull. A live source release remains unbuilt.

The next acquisition stage must preserve raw publisher XML bytes alongside the complete layer/item JSON and count/date/ID observations. The raw XML endpoint is not the rendered HTML metadata page, and its structure must not be assumed to match an FGDC title path. Retention is byte-for-byte: do not parse and reserialize the stored artifact or fetch links embedded in it. XML envelope checks are not schema validation, authenticity signatures or legal approval.

`runner/nj-childcare-metadata.mjs` now supplies `fetchNjChildcareMetadata()` for that stage. It returns unchanged raw bytes with their SHA-256, URL and observation time; it does not write files, publish releases or download business records. It enforces a one-megabyte ceiling, XML content type and strict UTF-8, rejects redirects, DTD/custom entity declarations and HTML, and checks the metadata envelope and dataset marker without executing or schema-validating XML. A 30-second header/body deadline, three bounded transient attempts and publisher Retry-After handling apply; cancellation propagates through fetch, body reading and retry waits.

A live utility call at 2026-09-07T19:45:56.197Z returned 137,808 bytes with SHA-256 `e9484bc27ecfcda7ebfc33212e5ee6d40109b6a9033d6e71b56858e32d215ad4`. This probe kept the bytes in memory only. The release builder now handles persistent XML retention; the existing preflight receipt is not retroactively marked XML-complete.

Metadata utility verification: seven new offline tests and the full 595-test repository suite passed, along with source/connector checks, lint, web/desktop builds, desktop smoke and TypeScript. The production dependency audit found zero vulnerabilities. This additive utility has no runtime data migration; removing it before acquisition integration does not affect existing datasets or pointers.

The acquisition sequence is layer, item, XML, count, dates, ID inventory, bounded selected-field batches, then ID inventory, dates, count, XML, item and layer. Compare raw XML hashes, stable item identity/terms, layer schema, count, date aggregates and sorted unique ID inventories before publishing. Any drift fails the acquisition; matching observations still do not establish a transactional snapshot. Use at most 100 IDs per feature request and enforce the encoded URL byte ceiling before dispatch, rather than relying on the server's larger record limit.

The immutable release must contain `publisher-metadata.xml`, selected features, normalized records, quarantine, complete acquisition observations and a manifest linking every artifact checksum and policy. The verifier must replay normalization and reject missing metadata, mismatched ID coverage, undeclared/private fields, inconsistent dates, unsafe paths and excessive quarantine. Preserve the original Web Mercator CRS evidence and the requested WGS84 output transformation; normalized business entities contain only latitude/longitude, not geometry objects. Do not infer corporate parents or current operations from center names or layer membership.

Only after acquisition, normalization and release verification pass may the NJ source enter the app's childcare queue. App workers own subsequent collection; no AI session should be needed. Refresh scheduling, restart checkpoints and reuse decisions must be implemented and tested before they are advertised. A metadata utility alone does not enroll a source or authorize record-level exports.

## Live preflight evidence

Verification: all 588 repository tests, source/connector checks, ESLint, web and desktop builds, desktop control-plane smoke, and `npx tsc --noEmit` passed. `npm audit --omit=dev` reported zero vulnerabilities. The ten new offline tests cover the preflight and CLI, including source drift, response limits, cancellation and immutable receipt publication.

On September 7, 2026, the standalone command passed all eight observations and saved `data/business-sources/nj-licensed-childcare-centers/preflights/572b795a-adef-4b37-8f6f-9bd61b41d892.json` (46,794 bytes; SHA-256 `36ec52b2a310babcd9d0e65e4d45457edc22eea587d007b6cae707d8538427f9`). The source reported 4,075 rows; no business rows were acquired. This count is neither a unique-business count nor proof of complete New Jersey childcare coverage. Connector readiness, scheduling and export authorization remained false. The receipt is local runtime evidence, not a committed source dataset.
