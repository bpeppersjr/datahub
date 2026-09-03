# Co*Tive Collector development roadmap

## Objective

Build a standalone, local-first data hub that can acquire, validate, normalize, reconcile, catalog, and publish mixed public and licensed datasets with durable workflows and operator-visible provenance.

The present application is a useful pre-alpha job runner:

```text
Electron shell
  -> React management interface
    -> loopback Node HTTP runner
      -> in-memory worker-thread queue
        -> browser, API, map, Places, pharmacy, download, parse, OCR, transform
          -> JSON control files and filesystem outputs
```

The next architecture remains one deployable application but enforces module boundaries:

```text
UI
  -> authenticated control plane
    -> durable orchestrator and scheduler
      -> supervised connector/operator execution
        -> raw source layer
          -> normalized assertions
            -> entity resolution and quality gates
              -> versioned datasets and policy-filtered exports

SQLite metadata: jobs, workflows, steps, attempts, leases, events,
source releases, artifacts, datasets, lineage, quality, and retention
```

Large artifacts stay on the filesystem; SQLite owns transactional metadata and coordination. PostgreSQL, object storage, remote workers, and multi-tenancy are deferred until measurements justify them.

## Release 0.2: foundation and recovery

This is the first implementation milestone. New nationwide connectors should wait until its P0 items are complete.

### DH-001 — Run-scoped ownership and overlap control

Owner: orchestration platform

- Add immutable `runId` to every checkpoint, staging path, output set, and lock owner.
- Reject or serialize overlapping runs for connectors that cannot safely overlap.
- Publish each output set atomically through a run directory with its manifest written last.
- Prove 20 concurrent submissions of one fixture job cannot overwrite another run.

### DH-002 — Cooperative cancellation and startup recovery

Owner: orchestration platform with verification

- Send a cooperative abort request and allow bounded cleanup before worker termination.
- Replace fixed stale locks with renewable leases that include owner identity and liveness.
- Reconcile queued/running records, abandoned leases, staging directories, `.part` files, and child processes at startup.
- Add fault-injection tests that cancel downloads and kill the runner during each publish phase.
- A cancelled job must be immediately restartable and leave no live process or blocking lock.

Current runtime evidence: a cancelled NPPES attempt left a dead-PID lock, a staging directory, and a 226,430,590-byte partial archive under `data/pharmacy-sources`. This roadmap does not delete those user runtime artifacts.

### DH-003 — Authenticate the local control plane

Owner: security and governance

- Generate a random per-launch control token and expose it to the sandboxed Electron renderer through a minimal preload bridge.
- Require authentication on every endpoint except narrowly defined liveness.
- Allow only the exact desktop and configured development origins; validate `Host`.
- Refuse non-loopback binding unless a separately designed authenticated remote mode is enabled.
- Add negative tests for every management and output endpoint.

### DH-004 — Versioned connector registry and validation

Owner: platform architecture and connector engineering

- Define the connector manifest required by `AGENTS.md`.
- Register connectors through one registry consumed by API, scheduler, worker, and UI.
- Validate connector-specific configuration before a run is queued.
- Generate typed UI configuration from the same schema where practical.
- Port one low-risk connector first, then Google Places and pharmacy without changing their observable outputs.

### DH-005 — Durable SQLite control metadata

Owner: orchestration platform

- Introduce versioned migrations and transactional tables for jobs, job versions, runs, steps, attempts, leases, events, artifacts, and settings.
- Import existing JSON state once and retain a rollback backup.
- Rehydrate resumable queued work and mark non-resumable interrupted work deterministically.
- Remove the implicit 500-run history cap; make retention explicit.
- Test migration, corruption detection, backup, restore, and process-kill recovery.

### DH-006 — Artifact catalog and provenance envelope

Owner: data engineering

- Assign every raw and published artifact an immutable ID, schema version, SHA-256, byte count, media type, source release, connector version, configuration hash, and retention policy.
- Make raw source releases immutable and publish replacements only after validation.
- Record input/output lineage for each workflow step.
- Update NPPES and pharmacy manifests to reference complete source-release identity rather than only a local path.

## Release 0.3: governed workflows

### DH-007 — Explicit workflow prerequisites

- Represent workflows as durable steps with dependencies, retries, leases, idempotency keys, and checkpoints.
- Convert NPPES acquisition into a reusable `AcquireSource` step required by pharmacy normalization.
- Expose the step graph, current attempt, and recovery action in the interface.

### DH-008 — Secrets and network/filesystem boundaries

- Replace stored secret values with named references backed by Windows credential storage.
- Redact credentials, cookies, signed URLs, and configured secret values everywhere.
- Validate redirects and resolved destinations; deny loopback, link-local, private, and metadata endpoints unless connector policy explicitly permits them.
- Use real-path validation against symlink, junction, UNC, and case-variant escapes.
- Pass child processes a minimal environment allowlist.

### DH-009 — Global resource, quota, and retry controls

- Add resource lanes for browser, network, CPU-heavy, and bulk-ingest work.
- Enforce provider-wide token buckets and request/spend budgets across all runs.
- Standardize capped exponential retry behavior and `Retry-After` handling.
- Add input, output, memory, disk, and execution-time limits per connector.

### DH-010 — Source policy, retention, and export enforcement

- Add versioned source-policy profiles describing license, allowed use, attribution, retention, redistributability, and restricted fields.
- Apply retention to raw files, normalized assertions, checkpoints, screenshots, logs, caches, and exports.
- Evaluate export permission at field level and produce auditable cleanup/export receipts.
- Keep Google, NCPDP, and other restricted assertions separated from public CMS or USDA records.

## Release 0.4: canonical data hub

### DH-011 — Canonical entity and assertion model

- Add organization, brand, physical site, establishment, service, external identifier, classification, relationship, and temporal assertion contracts.
- Preserve one-to-many relationships; never key pharmacy enrichment solely by NPI.
- Treat co-location separately from identity.
- Attach field-level provenance and policy to every assertion.

### DH-012 — Auditable entity resolution

- Resolve deterministic identifiers before scored name/address/phone/domain/geospatial evidence.
- Store the features, score, rule version, timestamp, and reversibility of every merge decision.
- Route ambiguous candidates to operator review.
- Establish a labeled benchmark and a release threshold for automatic-merge precision.

Implementation evidence: independently verified registry release `national-business-registry-20260902-043657439Z-c1eab4dd` emits 8,011,827 checksummed, source-preserving ZIP2 location profiles, including 24,230 conditional New York Agriculture and Markets retail-food-license premises, 84,485 California ABC Active issued-license premises grouped by File Number, 54,890 DC DLCP Active Basic Business License customer/site groups with 42,749 valid transformed MAR coordinates, 94,486 conditional Alaska DCCED active-license locations, 633,332 Los Angeles active-business locations, 885,097 Texas permit outlets linked to 700,705 taxpayer organizations, 42,864 Chicago active-license sites linked to 35,694 license-account organizations, and 31,163 NYC DCWP Active Premises-license sites and Business Unique ID organizations. All remain local-review-only. It separately preserves 72,783 Washington L&I active contractor-license organizations, 66,379 Delaware current-license organizations, and the other organization-only state layers without inferring sites. Independently verified resolution release `business-entity-resolution-20260902-075624674Z-881e778c` uses ruleset `business-entity-resolution@1.0.0` to publish 2,325,234 reversible exact-address site-alias decisions, 146,889 stricter exact-address-and-name establishment-alias decisions, and 106,011 unapplied scored review candidates. The verifier enforces dependency hashes, exact duplicate detection through a bounded partitioned identity index, decision uniqueness, scores, rule versions, counts, and local-review-only export policy.

Benchmark evidence: verified sample `business-entity-resolution-benchmark-sample-20260902-075956925Z-c5f3d239` deterministically selected 425 rows per stratum from 1,449,139 site-membership pairs, 74,733 establishment-membership pairs, and 106,011 review candidates. The documented proposed gate requires complete review, at least 384 conclusive labels per automatic stratum, no more than 10% exclusions, and a 95% Wilson lower bound of at least 0.99. Current submitted labels: zero; the gate is truthfully false.

Operator-review evidence: the local Co*Tive Collector page now serves verified packets with source comparisons, reviewer identity, controlled label values, required negative/exclusion notes, optimistic concurrency, an atomic working label copy, append-only proposed/committed audit events, download, filters, and live Wilson gate progress. The immutable benchmark sample itself is never edited. A separate checksummed label-snapshot publisher refuses an empty working set, recomputes rule and source-pair metrics, preserves corrections as later releases, and cannot authorize export.

Remaining gate: obtain independent labels, publish the first actual immutable label snapshot, evaluate the resulting source-pair-specific errors, formally approve the threshold, and authorize any record-level export under every contributing source policy.

### DH-013 — Validation, quarantine, and quality gates

- Produce counts for source, accepted, quarantined, duplicate, and rejected records plus null, uniqueness, and drift metrics.
- Quarantine invalid records with reasons instead of silently skipping them.
- Block publication on unexpected schema or material count drift while preserving the last known-good dataset.
- Show freshness, validation, licensing, and publishability separately in the UI.

### DH-014 — Dataset catalog and live observability

- Replace polling with a durable event stream such as SSE.
- Add workflow graph, structured logs, request/cost metrics, artifact lineage, source freshness, and quality views.
- Split the single page component into typed feature modules.
- Let an operator trace a published field back to assertion, source record, release hash, ingest run, and policy.

## First governed data program: national grocery registry

Start only after Release 0.2 foundations are complete.

1. Ingest USDA current and historical SNAP retailers while retaining their stated coverage limits.
2. Add state retail-food and business-license open datasets through policy-scoped connectors.
3. Add authorized chain store feeds or locators.
4. Add a licensed national POI source if required completeness justifies its cost and contract.
5. Use Google Places counts and durable Place IDs for gap detection and verification, not as unrestricted permanent content.
6. Use authoritative ZIP/ZCTA geography and adaptive spatial subdivision; do not iterate every number from `00100` through `99999` as though each were a physical ZIP area.
7. Report coverage, freshness, source contribution, conflicts, and unresolved gaps by state, county, and ZCTA.

Coverage-view evidence: verified publisher 2.7.0 release `national-business-coverage-views-20260902-115337634Z-ba689784` pins the registry, geography, ZCTA jurisdiction overlay, resolution, benchmark, and Census Nonemployer manifests. It publishes three national scopes, 56 state views, 3,235 county views, 48,217 ZIP views, 26 source views, and 28,127 first-class gap rows. New York retail food contributes 24,281 license organizations, 24,230 conditional site profiles, 24,280 ZIP-evidence addresses, and 22,999 usable platform geocodes; 22,948 site-profile coordinates receive one county assignment and retain their address-component-centroid limitation. Washington L&I contributes 72,783 contractor-license organizations and 74,005 ZIP-eligible mailing-address records without inferring physical sites. California ABC contributes 84,485 grouped premises profiles from 105,417 license activities and no coordinates; DC contributes 54,890 grouped customer/site profiles, including 42,749 valid source coordinates; Alaska contributes 94,818 active-license organizations, 94,486 conditional site profiles, 94,504 reported U.S. address/ZIP records, and no coordinates; Delaware contributes 66,379 current-license organizations and 66,215 eligible reported U.S. address records without inferring physical sites. NYC DCWP contributes 31,163 grouped license-site profiles and Business Unique ID organizations; Chicago contributes 42,864 grouped license-site profiles and 35,694 account organizations; Texas contributes 885,097 provisional permit-outlet profiles and 700,705 taxpayer organizations; Los Angeles retains 633,332 profiles and 566,943 source geocodes. All 8,011,827 location profiles were assessed; 995,268 coordinate-bearing profiles received one county assignment, while missing, unmatched, ambiguous, and conflicting geography remains explicit. The complete selected Census set of 33,791 ZCTA5 polygons is now the explicit spatial ZIP denominator; its manifest, ZCTA-index, and member-set hashes are pinned and exact member/gap sets are verified. Another 14,426 source-reported five-digit postal values remain visible outside it, ZIP+4 is non-geometric, optional USPS routing evidence is not a spatial gate, and polygon-area weights are never used as business-location weights. Registry 2.9.0 is explicitly labeled pre-migration for split ZIP5/ZIP4 fields; new source generators and registry 2.10.0 enforce the correction, with the ordered source-to-registry rebuild still pending. The release remains partial, source-preserving, non-deduplicated, and local-aggregate-review-required.

Postal-migration control evidence: a versioned readiness inventory audits all 25 current source pointers, freezes pointer/manifest/configuration hashes into a deterministic plan hash, exposes production and isolated-candidate counts in the management API, and prevents registry 2.10.0 from starting while any source is stale. Twenty-four independently verified isolated candidates are ready; Florida remains credential-blocked. A separate cutover controller now verifies every manifest artifact, copies immutable releases before changing pointers, uses an exclusive lock and exact-hash compare-and-swap, journals every transition, automatically restores promoted pointers on ordinary failure, recovers dead-owner interrupted runs, and supports guarded pointer-only rollback. The management API exposes safe lock and latest-run state without its ownership token. Planning and execution remain fail-closed until the Florida candidate exists, and no production pointer has been promoted.

Nonemployer-baseline evidence: verified Census release `census-nonemployer-2023-20260830-230249716Z-78268f89` preserves 1,153,323 official source rows and publishes 30,427,808 annual no-paid-employee establishments across the national and 51 state/D.C. totals plus 3,143 county totals. The coverage view carries published or explicit-null baselines on all state/county views and prohibits ZIP allocation. Its gap rows include five state equivalents, 92 county equivalents, the single national/county reconciliation difference, and the source-wide absence of ZIP-level Nonemployer data.

Current ZIP evidence progress: the complete selected Census ZCTA5 release is the spatial polygon denominator. The `usps-operational-zip-assignments` connector remains available as optional supplemental routing evidence; it discovers and validates the current PostalPro Area/District and AISU files, excludes AISU-only routing rows, and can publish immutable local-restricted releases. A live USPS source remains gated on a truthful personal non-commercial use basis or reviewed USPS written permission, but that no longer blocks Census polygon coverage. Public redistribution is not inferred from download access.

## Verification and release gates

Every milestone must pass:

- unit, connector-conformance, server, store, worker, and integration tests;
- cancellation, concurrency, restart, fault-injection, retention, and secret-canary tests;
- Electron end-to-end tests for operator-critical workflows;
- `npm run check`, type checking, production dependency audit, secret scan, license scan, and SBOM generation;
- clean Windows VM packaging tests without preinstalled Node, npm, Git, or browser;
- migration, upgrade, backup, restore, rollback, and data-preservation checks;
- signed, checksummed release artifacts with release and migration notes.

Remote access, multi-user operation, or production data claims remain out of scope until the security, lifecycle, and release gates have passed.
