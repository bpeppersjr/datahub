# Bounded base evidence for the ordinary ZIP inspector

The existing authenticated `GET /api/business-map/zip-inspector` now selects its registry-quality and coverage-view base evidence exclusively through reviewed registrations:

- `config/datasets/registry-zip-quality-index.json`
- `config/datasets/coverage-zip-view-index.json`

`runner/zip-inspector-indexed-reader.mjs` checks exact registration status, manifest identity/bytes, bindings, claims, inventory hash/count/bytes and registry audit summary. It calls only the bounded lookup entry points. Missing, corrupt or incompatible registrations return the existing unavailable HTTP failure; there is **no fallback** to full registry auditing, coverage dimension scanning, discovery or rebuilding.

## Compatibility and preserved semantics

Both indexes must select exactly the same registry release, pointer hash and manifest hash. Current coverage/registry/geography pointers and manifests, coverage catalog, ZIP-quality enrollment and selected index buckets are bounded and rechecked after reads and again after auxiliary loaders finish. Source file identities are checked across the complete request. The underlying coverage lookup verifies catalog dependencies, registry/geography lineage and spatial-denominator pins. The registry lookup verifies the exact enrolled source artifact and reviewed audit implementation.

The inspector-only catalog is built from these exact bindings plus a narrowly exported immutable copy of the existing authoritative map category metadata. It does not call `businessMap.getCatalog()` or `ensureIndex()`, which would cold-load the monolithic map. Other map endpoints continue using their existing path and taxonomy. Category source-ID membership is unchanged; qualification's separate category map is not substituted for it.

The response schema remains `1.0.0`: counts, postal fields, ZCTA membership, positive category contributions, employer alignment, limitations and separate auxiliary source blocks keep their previous semantics. The opaque ZIP-quality audit identifier now identifies the immutable verified index (`indexed-<release ID>`), not a new whole-registry audit performed for this request. No freshness claim is inferred. Missing evidence remains null/absent, placeholders remain explicitly classified, and ZIP4 remains separate and non-geometric. No active-business or completeness claims are introduced.

## Resource, cancellation and trust boundary

Base payload reads are one registry row (at most 1,048,576 bytes) and one coverage row (at most 65,536 bytes), plus bounded registration/manifest/bucket metadata. No 503MB registry artifact or monolithic coverage dimension is read. This bound does **not** include the unchanged auxiliary source aggregate readers.

The HTTP adapter enforces empty GET, exact ZIP5, closed query keys, no repeated options, a 2MB response ceiling and a 120-second response deadline. Existing Host/Origin/bearer authorization remains ahead of dispatch. Timeout returns503 to a connected client, even when an aborted reader resolves; disconnected clients receive no late response. Pre-aborted requests do not start work. Abort/listener cleanup and bounded base handle closure are tested.

Signals reach the base reader and every auxiliary callback; supported FSIS/EPA/IRS/NPPES lookups receive them. Legacy pharmacy/SNAP/FMCSA/FDIC/NCUA readers do not yet implement cooperative cancellation. Their already-started local I/O may finish after a deadline/disconnect. This slice does not claim that all auxiliary work drains immediately or that the complete inspector is a constant-size lookup.

No other endpoint, current pointer, registration, publisher, index implementation or UI is changed by this integration. The standalone ZIP-quality endpoint retains its existing full audit behavior. No acquisition or publication occurs on request.

## Verification

Focused fixtures publish tiny real indexed chains under `data/tmp`; they prove legacy response equivalence, zero/null/absent/placeholder preservation, exact registered/current lineage, no legacy fallback, positional base reads, post-auxiliary pin drift, cancellation/handle cleanup and immutable taxonomy. Existing inspector/map tests remain in the focused gate. HTTP tests cover malformed/framed input, authorization placement, disconnect/pre-abort and the deadline/late-resolution case.

`DATAHUB_TEST_ZIP_INSPECTOR_INDEXED=1` enables read-only installed bounded checks. It does not perform native publication or full index reconstruction. Full repository/runtime acceptance remains a separately coordinated release gate.

Implementation model: supported Astra fallback, dedicated application/testing agent.
