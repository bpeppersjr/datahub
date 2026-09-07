# Massachusetts childcare acquisition and normalization

Implemented modules: `runner/ma-childcare-acquisition.mjs` and `runner/ma-childcare-normalization.mjs`. These are application-side functions, not AI-dependent execution. They are not yet a published dataset, managed job, or complete connector. No live row request was made for this increment.

## Acquisition contract

`acquireMaChildcare` accepts only transport, clock, cancellation, sleep and bounded timeout options. Source host, layer, SQL scope and selected fields are fixed by the existing preflight contract. No PHONE field, caller URL, credential or arbitrary SQL override is accepted.

Execution reads metadata, count and sorted ID inventory; fetches explicit ID batches of at most 500 (also limited by publisher maximum); then rechecks inventory, count and metadata. The source ceiling is 20,000 rows and eight megabytes per response. Each request has a default 30-second deadline through body reading, three attempts for transient failures, and one-second spacing between successful observations. Publisher waits above 60 seconds defer instead of retrying early. All requests reject redirects and cancellation interrupts requests or waits.

Missing, extra or duplicate IDs, selected-field drift, truncated batches, changed counts/inventories/edit metadata and non-WGS84 response coordinates fail acquisition. Results retain selected feature attributes, source point data and per-response parsed-payload hashes with observation timestamps. No disk artifacts are written. Matching checks are not transactional snapshot isolation, a freshness promise or proof of business operation.

## Normalized program records

`normalizeMaChildcareFeature` requires run ID, source release ID, UTC observation time and verified WGS84 output context. A future release builder must supply these from real acquisition evidence, not arbitrary fixture labels. The source OBJECTID is scoped to the release; EEC provider number and MassGIS address ID remain external identifiers with unverified lifecycle. Same-address programs are not silently merged into one business.

The function requires Center-based Care and Licensed scope fields, excludes undeclared fields, and rejects missing names/addresses, P.O. boxes, malformed postal fields and invalid capacity. ZIP5 and ZIP4 are separate strings; the compatibility postal_code alias contains ZIP5 only. Massachusetts/U.S. address jurisdiction derives from publisher scope and is marked as not boundary-verified.

Output business records have longitude/latitude, not feature geometries. Missing source points remain missing. Coordinates must fit a broad plausibility envelope (longitude -74 through -69; latitude 41 through 43), which is explicitly not a state-boundary test. Source statuses, capacity and program umbrella labels are preserved without inferring active operation, parent ownership or unique canonical identity. Unknown or missing statuses remain explicit. Outputs are local-review-only pending the release-level policy gate.

## Remaining work before app execution

Build run-scoped immutable raw/normalized artifacts and manifest linkage, controlled record quarantine versus whole-source scope rejection, independent artifact verification, cancellation-safe publication and recovery. Include explicit first/last observations and disappearance semantics in versioned comparisons rather than turning a missing row into a closure. Integrate the validated connector with an explicit childcare industry bucket and app-owned scheduling only after those checks pass.

The metadata-only preflight remains unchanged and correctly reports connector_ready false. Existing production pointers, pinned source configuration and current reconciliation are untouched. See [source/policy evidence](states/MA-CHILDCARE-ACCESS-2026-09-07.md). No migration is required for these additive modules; removing them does not remove existing releases.

Verification: 14 focused tests and the final full 551-test repository check passed, including lint, web/desktop builds and desktop smoke. TypeScript passed and the production audit found zero vulnerabilities. Peer review prompted rejection of contradictory per-feature CRS identifiers; both acquisition and normalization now test that case. These are offline code checks, not evidence of a published Massachusetts release.
