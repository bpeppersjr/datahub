# Massachusetts childcare acquisition and normalization

Implemented modules cover acquisition, normalization and local release publication/verification. These are application-side functions, not AI-dependent execution. No live Massachusetts dataset has been acquired by these implementation increments, and managed industry enrollment is still pending.

## Acquisition contract

`acquireMaChildcare` accepts only transport, clock, cancellation, sleep and bounded timeout options. Source host, layer, SQL scope and selected fields are fixed by the existing preflight contract. No PHONE field, caller URL, credential or arbitrary SQL override is accepted.

Execution reads metadata, count and sorted ID inventory; fetches explicit ID batches of at most 500 (also limited by publisher maximum); then rechecks inventory, count and metadata. The source ceiling is 20,000 rows and eight megabytes per response. Each request has a default 30-second deadline through body reading, three attempts for transient failures, and one-second spacing between successful observations. Publisher waits above 60 seconds defer instead of retrying early. All requests reject redirects and cancellation interrupts requests or waits.

Missing, extra or duplicate IDs, selected-field drift, truncated batches, changed counts/inventories/edit metadata and non-WGS84 response coordinates fail acquisition. Results retain selected feature attributes, source point data and per-response parsed-payload hashes with observation timestamps. No disk artifacts are written. Matching checks are not transactional snapshot isolation, a freshness promise or proof of business operation.

## Normalized program records

`normalizeMaChildcareFeature` requires run ID, source release ID, UTC observation time and verified WGS84 output context. The release builder supplies these from its acquisition evidence; direct callers must not substitute arbitrary fixture labels for live provenance. The source OBJECTID is scoped to the release; EEC provider number and MassGIS address ID remain external identifiers with unverified lifecycle. Same-address programs are not silently merged into one business.

The function requires Center-based Care and Licensed scope fields, excludes undeclared fields, and rejects missing names/addresses, P.O. boxes, malformed postal fields and invalid capacity. ZIP5 and ZIP4 are separate strings; the compatibility postal_code alias contains ZIP5 only. Massachusetts/U.S. address jurisdiction derives from publisher scope and is marked as not boundary-verified.

Output business records have longitude/latitude, not feature geometries. Missing source points remain missing. Coordinates must fit a broad plausibility envelope (longitude -74 through -69; latitude 41 through 43), which is explicitly not a state-boundary test. Source statuses, capacity and program umbrella labels are preserved without inferring active operation, parent ownership or unique canonical identity. Unknown or missing statuses remain explicit. Outputs are local-review-only pending the release-level policy gate.

## Remaining work before app execution

Standalone CLI execution is implemented below. Managed app enrollment, versioned first/last-observation comparisons, disappearance handling and explicit crash-recovery workflows remain. A missing row must not become a closure assertion. Integrate the validated connector with an explicit childcare industry bucket only after source-contract and runtime plan checks pass.

The metadata-only preflight remains unchanged and correctly reports connector_ready false. Existing production pointers, pinned source configuration and current reconciliation are untouched. See [source/policy evidence](states/MA-CHILDCARE-ACCESS-2026-09-07.md). No migration is required for these additive modules; removing them does not remove existing releases.

Verification: 14 focused tests and the final full 551-test repository check passed, including lint, web/desktop builds and desktop smoke. TypeScript passed and the production audit found zero vulnerabilities. Peer review prompted rejection of contradictory per-feature CRS identifiers; both acquisition and normalization now test that case. These are offline code checks, not evidence of a published Massachusetts release.

## Standalone release commands

Release-workflow verification: eight release tests and two CLI tests passed as part of the full 561-test repository check, including lint, web/desktop builds and desktop smoke. TypeScript passed; the production dependency audit found zero vulnerabilities. Tests used offline fixtures, including real subprocess cancellation; no live Massachusetts acquisition or managed-app enrollment is claimed.

`npm run ma-childcare:build -- --output <path-inside-datahub>` acquires the fixed selected layer, normalizes it, verifies the resulting immutable release and publishes a local pointer. Omit --output for `data/business-sources/ma-licensed-center-based-childcare`. This command makes real provider requests unless a test explicitly injects transport. It needs neither Codex nor credentials. `--help` does not acquire anything.

`npm run ma-childcare:verify -- <release-manifest.json>` verifies an existing local manifest without network access. Supply the manifest path reported by the build, not current.json. Both commands accept the app's IPC cancellation and process signals.

The builder retains four checksummed artifacts: selected-features.jsonl (internal), normalized.jsonl (local-review-only), quarantine.jsonl (internal), and source-observation.json (internal). Raw selected point features are provenance artifacts; normalized business records contain only longitude/latitude. Source identity binds selected feature content and acquisition evidence. Immutable release manifests record policy, transformation version, counts and explicit non-completeness/non-operating claims.

Scope or private-field drift fails the whole source; record-level validation failures may be quarantined only up to five percent, with at least one accepted record. Verification hashes the retained artifacts and reproduces normalization and quarantine from selected features. It structurally checks source observation evidence; it cannot independently rehash full publisher metadata/count/ID responses that acquisition retained only as digests. This is not a source-authenticity signature or proof that the publisher supplied a transactional snapshot.

An exclusive per-output-root lock prevents simultaneous publishers and is never reclaimed merely because it looks stale. Cancellation before the commit boundary cleans only owned staging; ordinary failed staging remains inspectable. After release rename starts, pointer commit is not interrupted by cooperative cancellation. Disk failure or abrupt termination can still leave a release without a new pointer or a retained lock; automatic crash recovery is not claimed. Prior releases and unrelated preflight receipts are preserved.
