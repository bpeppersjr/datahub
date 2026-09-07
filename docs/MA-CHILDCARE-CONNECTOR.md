# Massachusetts childcare acquisition and normalization

Implemented modules cover acquisition, normalization and local release publication/verification. These are application-side functions, not AI-dependent execution. Managed industry enrollment is implemented below; enrollment and offline test results alone do not establish live source acquisition or national reporting coverage.

## Acquisition contract

`acquireMaChildcare` accepts only transport, clock, cancellation, sleep and bounded timeout options. Source host, layer, SQL scope and selected fields are fixed by the existing preflight contract. No PHONE field, caller URL, credential or arbitrary SQL override is accepted.

Execution reads metadata, count and sorted ID inventory; fetches explicit ID batches of at most 100 (also limited by publisher maximum); then rechecks inventory, count and metadata. Connector 1.0.1 rejects URLs above 2,000 bytes before sending them. The source ceiling is 20,000 rows and eight megabytes per response. Each request has a default 30-second deadline through body reading, three attempts for transient failures, and one-second spacing between successful observations. Publisher waits above 60 seconds defer instead of retrying early. All requests reject redirects and cancellation interrupts requests or waits. The verifier retains support for earlier 1.0.0 releases and their 500-ID observation contract without rewriting their evidence.

Missing, extra or duplicate IDs, selected-field drift, truncated batches, changed counts/inventories/edit metadata and non-WGS84 response coordinates fail acquisition. Results retain selected feature attributes, source point data and per-response parsed-payload hashes with observation timestamps. No disk artifacts are written. Matching checks are not transactional snapshot isolation, a freshness promise or proof of business operation.

## Normalized program records

`normalizeMaChildcareFeature` requires run ID, source release ID, UTC observation time and verified WGS84 output context. The release builder supplies these from its acquisition evidence; direct callers must not substitute arbitrary fixture labels for live provenance. The source OBJECTID is scoped to the release; EEC provider number and MassGIS address ID remain external identifiers with unverified lifecycle. Same-address programs are not silently merged into one business.

The function requires Center-based Care and Licensed scope fields, excludes undeclared fields, and rejects missing names/addresses, P.O. boxes, malformed postal fields and invalid capacity. ZIP5 and ZIP4 are separate strings; the compatibility postal_code alias contains ZIP5 only. Massachusetts/U.S. address jurisdiction derives from publisher scope and is marked as not boundary-verified.

Output business records have longitude/latitude, not feature geometries. Missing source points remain missing. Coordinates must fit a broad plausibility envelope (longitude -74 through -69; latitude 41 through 43), which is explicitly not a state-boundary test. Source statuses, capacity and program umbrella labels are preserved without inferring active operation, parent ownership or unique canonical identity. Unknown or missing statuses remain explicit. Outputs are local-review-only pending the release-level policy gate.

## Remaining reporting and recovery work

Standalone and managed app execution are implemented below. National registry integration, versioned first/last-observation comparisons, disappearance handling and explicit crash-recovery workflows remain. A missing row must not become a closure assertion.

### Verified local registry conversion

`loadMaChildcareRegistryInput(manifestPath, { signal })` in `runner/ma-childcare-registry-input.mjs` verifies an existing immutable release, rechecks the manifest digest, bounded normalized-artifact bytes/hash and record count, then calls the pure `reconcileMaChildcareProgram` adapter. It makes no provider requests, writes no outputs and changes no pointers. Callers must supply the immutable manifest path, not current.json. Direct use of the pure adapter only validates shape and context; it cannot independently prove artifact membership or authenticity.

Conversion produces a provisional physical-site candidate and establishment candidate for each accepted source row. IDs are scoped to source-release/OID evidence, not an assumption that provider or address identifiers represent canonical businesses. There is no invented organization, owner, `operates` relationship or automatic match profile. Only the source-reported location relationship is represented. ZIP5, ZIP4, nullable publisher latitude/longitude, source licensing status, capacity, affiliation labels and policy evidence remain intact. Assertion/relationship `active` status describes the retained assertion representation, not whether a program operates; first_seen/last_seen are limited to this observation, with unknown validity dates.

The assertion schema now recognizes the existing restrictive `local-review-only` policy value. This aligns schema validation with existing source adapters; it does not authorize export. The new adapter is checked against actual entity/assertion/relationship schemas. No stored release is migrated or rewritten by this additive change.

Read-only conversion of the verified first release yielded 3,007 contributions: 6,014 distinct source-scoped entity candidates (3,007 sites plus 3,007 establishments), 30,042 assertions, and 3,007 location relationships. Those two entity types must not be summed into a business count. There are zero organization candidates and zero match profiles; all assertions remain local-review-only. Conversion succeeded from retained files without repull or publication.

Remaining integration gates: add explicit input/writer/summary and independent-verifier support to the national registry after the current pinned reconciliation permits changes; support the latitude/longitude `site.reported-location` object in coordinate reporting without adding business geometries; preserve quarantine and source-status denominators; map childcare source/industry evidence explicitly; and build a newly governed reporting cohort before marking the state ledger measured. Existing adapters often use GeoJSON `site.location`; this adapter deliberately does not silently adopt that representation. Cross-release lifecycle comparisons and identity matching require separate evidence. Rolling back the new converter does not delete or invalidate the acquired source release.

Converter verification: eight focused adapter/loader tests and the full 578-test repository check passed, including lint, web/desktop builds and desktop smoke. TypeScript passed and the production dependency audit found zero vulnerabilities. Live-file conversion was read-only; no new acquisition, reporting artifact or production pointer was created.

The metadata-only preflight remains unchanged: its connector_ready false flag means that metadata inspection does not establish application readiness, not a dynamic catalog lookup. Its historical next-step text is not an execution gate. Existing production pointers, pinned source configuration and current reconciliation are untouched. See [source/policy evidence](states/MA-CHILDCARE-ACCESS-2026-09-07.md). No migration is required for these additive modules; removing enrollment does not remove existing releases.

Verification: 14 focused tests and the final full 551-test repository check passed, including lint, web/desktop builds and desktop smoke. TypeScript passed and the production audit found zero vulnerabilities. Peer review prompted rejection of contradictory per-feature CRS identifiers; both acquisition and normalization now test that case. These are offline code checks, not evidence of a published Massachusetts release.

## Standalone release commands

### Managed industry handoff

The `childcare` industry maps to `state-ma-childcare`, invoking `scripts/build-ma-childcare.mjs` through Co*Tive's existing standalone industry worker. Only MA is supported; selecting other states records gaps and does not duplicate the MA source. There are no local Census prerequisites for acquisition; the builder performs its own fixed-source metadata/count/ID checks before retrieving features. This does not waive downstream geography and reconciliation requirements.

Inspect without downloading:

```powershell
node scripts/run-industry-segments.mjs plan --industry childcare --state MA
```

Execute through the app-owned worker (makes real provider requests):

```powershell
node scripts/run-industry-segments.mjs run --industry childcare --state MA --run-id <unique-run-id>
```

The app records a durable plan, receipt and checksummed worker log, reserves the source across concurrent industry runs, and forwards cancellation through IPC. The child verifies its release before returning success. Outputs remain under `data/industry-segments/runs/<run-id>/state-ma-childcare-MA`; national reporting pointers are not changed. A refresh creates new immutable evidence, not a closure inference or an automatically merged national dataset. No recurring refresh cadence is enabled by enrollment.

The source contract is `config/connectors/ma-licensed-center-based-childcare.json`; policy is `config/source-policies/massgis-eec-childcare-local-review.json`. The state ledger deliberately uses an unmeasured profile mapping until a registry adapter and reconciled coverage release exist. Its `NOT_READY_EVIDENCE_UNMEASURED` status concerns reporting evidence, not whether the acquisition CLI can execute.

Offline integration runs the real industry CLI and child worker with fixture-only transport, checks a verified publication and durable receipt, and proves scope drift fails without publishing a pointer. These tests do not contact the provider.

### First live handoff and request-size correction

Co*Tive run `ma-app-acquisition-20260907-01` failed on September 7, 2026 before artifact publication (19:03:47.937Z–19:03:52.524Z). Receipt: `data/industry-segments/runs/ma-app-acquisition-20260907-01/receipt.json`, SHA-256 `ca33459b335da02963726420e099e4a885766d8bbde166c70b0d9851595fa962`. The controller exited, no current pointer was published, and ordinary failed staging was retained. Do not overwrite this run or describe it as an acquired dataset.

Bounded diagnostics confirmed metadata and the 3,016-ID inventory were accessible. The 500-ID selected-field GET was 3,241 URL bytes and returned HTTP 404 with HTML; a shorter 100-ID probe returned HTTP 200 JSON. Probe response bodies were discarded, not retained as a dataset. This supports reducing GET size; it does not establish the provider's exact infrastructure limit. Connector 1.0.1 uses at most 100 IDs, rejects URLs over 2,000 bytes locally, and includes safe phase/HTTP status in acquisition errors. Inventory completeness, scope, selected-field and quarantine checks are unchanged. No fallback to unselected fields or relaxed validation is used.

After the correction, the full repository check passed (tests, lint, web/desktop builds and desktop smoke); TypeScript passed and the production dependency audit found zero vulnerabilities. Regression tests cover 201 IDs split into 100/100/1 complete batches, rejection of an overlong URL before transport, and retained verifier support for earlier release versions.

Replacement app-owned run `ma-app-acquisition-20260907-02` started at 19:09:41.589Z with expected plan SHA-256 `0af9d96585a3590a7f9b904ebe2270495eefd1837b50d4a5c36a9c5421623408`. Controller PID 24300 and acquisition worker PID 10804 were confirmed live after launch. Inspect `data/industry-segments/runs/ma-app-acquisition-20260907-02/receipt.json` for its current state; launch is not completion evidence. This separate run preserves the failed first attempt and does not require a live AI session for ongoing acquisition.

### Verified first acquisition

Run `ma-app-acquisition-20260907-02` subsequently completed successfully at 19:10:25.516Z. Its controller and worker exited. The independent release CLI reproduced and verified all four artifacts (7,132,377 bytes total); a separate integrity check verified the app receipt's worker-log hash, current-pointer manifest hash, empty staging and released publication/source locks. No data was repulled for these checks.

- Release: `ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6`.
- Manifest: `data/industry-segments/runs/ma-app-acquisition-20260907-02/state-ma-childcare-MA/releases/ma-childcare-2fd11c60-e9e8-488f-8693-f44bd03582d6/manifest.json`.
- Manifest SHA-256: `c6d811e5743a03d7126d1e34b3763f4c1acbd495a5b4cf68f82c716c50fba1fc`.
- App receipt SHA-256: `d5d45ad2753cdc7b9584d1117e5767967d41c0265103e59bf93b1c4458e03774`.
- Source rows: 3,016; accepted program records: 3,007; quarantine: 9 (approximately 0.30%, within the 5% gate).
- Acquisition evidence: 31 bounded feature batches, plus metadata/count/ID inventory before and after; observed interval 19:09:41.656Z–19:10:25.331Z on September 7, 2026.

This is the first acquired local-review source release, not a national reporting promotion. All source rows were accounted for against the observed inventory, but that does not establish complete childcare coverage, unique entities, current operating status, or current USPS validity. Publisher editing dates remain separate from this observation interval. The existing failed run, production reporting pointers, and active D.C. candidate reconciliation are unchanged. Subsequent local integration must reuse this release rather than download it again merely to promote or reconcile it.

Independent read-only semantic review found all nine quarantines were `invalid-postal-code`. Accepted source statuses were Current (2,561), Renewal in progress (431), Expired (13), and Regional Enrollment Freeze (2); these are retained source licensing labels, not inferred active/inactive business decisions. All 3,007 accepted records have publisher coordinates, but no independent geocode or boundary verification. ZIP4 is present separately in 1,113 records; every accepted postal_code alias equals ZIP5, and normalized records have no geometry field. Distinct source/provider identifiers do not establish distinct businesses. All accepted records retain local-review-only policy and explicit unverified identity, operations, ownership and postal-validity claims.

Verification of this evidence-recording increment: all 570 repository tests, lint, web/desktop builds and desktop smoke passed; TypeScript passed and the production dependency audit found zero vulnerabilities. Only documentation changed. Rolling back this documentation does not delete the acquired release or alter its pointers.

### Direct release commands

Release-workflow verification: eight release tests and two CLI tests passed as part of the full 561-test repository check, including lint, web/desktop builds and desktop smoke. TypeScript passed; the production dependency audit found zero vulnerabilities. Tests used offline fixtures, including real subprocess cancellation; no live Massachusetts acquisition or managed-app enrollment is claimed.

`npm run ma-childcare:build -- --output <path-inside-datahub>` acquires the fixed selected layer, normalizes it, verifies the resulting immutable release and publishes a local pointer. Omit --output for `data/business-sources/ma-licensed-center-based-childcare`. This command makes real provider requests unless a test explicitly injects transport. It needs neither Codex nor credentials. `--help` does not acquire anything.

`npm run ma-childcare:verify -- <release-manifest.json>` verifies an existing local manifest without network access. Supply the manifest path reported by the build, not current.json. Both commands accept the app's IPC cancellation and process signals.

The builder retains four checksummed artifacts: selected-features.jsonl (internal), normalized.jsonl (local-review-only), quarantine.jsonl (internal), and source-observation.json (internal). Raw selected point features are provenance artifacts; normalized business records contain only longitude/latitude. Source identity binds selected feature content and acquisition evidence. Immutable release manifests record policy, transformation version, counts and explicit non-completeness/non-operating claims.

Scope or private-field drift fails the whole source; record-level validation failures may be quarantined only up to five percent, with at least one accepted record. Verification hashes the retained artifacts and reproduces normalization and quarantine from selected features. It structurally checks source observation evidence; it cannot independently rehash full publisher metadata/count/ID responses that acquisition retained only as digests. This is not a source-authenticity signature or proof that the publisher supplied a transactional snapshot.

An exclusive per-output-root lock prevents simultaneous publishers and is never reclaimed merely because it looks stale. Cancellation before the commit boundary cleans only owned staging; ordinary failed staging remains inspectable. After release rename starts, pointer commit is not interrupted by cooperative cancellation. Disk failure or abrupt termination can still leave a release without a new pointer or a retained lock; automatic crash recovery is not claimed. Prior releases and unrelated preflight receipts are preserved.
