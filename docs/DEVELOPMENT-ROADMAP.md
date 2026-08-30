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

Implementation evidence: independently verified registry release `national-business-registry-20260830-201530698Z-7230b6a4` emits 6,161,280 checksummed, source-preserving ZIP2 location profiles. Independently verified resolution release `business-entity-resolution-20260830-204410292Z-371d0923` uses ruleset `business-entity-resolution@1.0.0` to publish 1,635,421 reversible exact-address site-alias decisions, 65,069 stricter exact-address-and-name establishment-alias decisions, and 53,727 unapplied scored review candidates. The verifier enforces dependency hashes, decision uniqueness, scores, rule versions, counts, and local-review-only export policy.

Benchmark evidence: verified sample `business-entity-resolution-benchmark-sample-20260830-210015066Z-d9d1af77` deterministically selected 425 rows per stratum from 1,014,108 site-membership pairs, 32,623 establishment-membership pairs, and 53,727 review candidates. The documented proposed gate requires complete review, at least 384 conclusive labels per automatic stratum, no more than 10% exclusions, and a 95% Wilson lower bound of at least 0.99. Current submitted labels: zero; the gate is truthfully false.

Remaining gate: obtain independent labels, add an auditable operator-review interface and immutable label-decision publisher, evaluate source-pair-specific errors, formally approve the threshold, and authorize any record-level export under every contributing source policy.

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

Current ZIP-denominator progress: the `usps-operational-zip-assignments` connector now discovers and validates the current PostalPro Area/District and AISU files, excludes AISU-only routing rows, publishes immutable local-restricted releases, and can feed scoped assignment evidence into registry ZIP coverage. A live source and rebuilt registry remain gated on a truthful personal non-commercial use basis or reviewed USPS written permission; public redistribution is not inferred from download access.

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
