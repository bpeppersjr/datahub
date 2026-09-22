# Connector registry contract

Co*Tive Collector loads every `config/connectors/*.json` manifest through one fail-closed registry before the local runner begins listening. A malformed connector, missing policy, embedded secret, invalid default, noncanonical lifecycle, or host declaration drift prevents startup instead of allowing an ungoverned acquisition.

## Registry boundary

Registry version `1.0.0` requires each manifest to declare:

- a filename-matching connector ID and semantic version;
- the canonical lifecycle `preflight → plan → acquire → validate → normalize → reconcile → quality gate → publish → finalize` (connector-specific intermediate stages are allowed);
- a closed connector configuration schema and valid defaults;
- named secret references, never secret values;
- input and output artifact types;
- exact allowed hostnames and redirect policy;
- provider budget key, resource class, and execution limits;
- retry, checkpoint, idempotency, and cancellation behavior;
- one exact `config/source-policies/*.json` document and a retention profile;
- produced entities and identifiers.

The referenced source policy must itself carry a version, ownership, allowed and prohibited uses, attribution, retention, and redistribution terms. Derived datasets may add an inheritance note, but prose cannot replace the exact policy path.

## Operator interface and API

The **Connector registry** section of the management page shows the validated connector and policy counts, network/local scope, resource class, export posture, allowed hosts, artifact contracts, produced records, required configuration, named secret references, and manifest digest. It never returns secret values.

All registry endpoints use the authenticated loopback control plane:

- `GET /api/connectors` lists the registry metadata and sanitized connector entries.
- `GET /api/connectors/:connector_id` returns one sanitized entry.
- `POST /api/connectors/:connector_id/validate` validates `{ "configuration": { ... } }`, applies declared defaults, and returns HTTP `422` for configuration drift. Invalid input values are not echoed.

Run `npm run connectors:check` for a standalone fail-closed audit. `npm run check` runs this gate before the broader tests and builds.

## Current boundary

This increment centralizes and validates all existing manifests and makes the same sanitized catalog visible to the API and UI. Existing ad-hoc job types have not yet been converted into registry-backed execution adapters, and the job editor does not yet generate typed controls from every connector schema. Consequently, this work does not claim that scheduler or worker migration under DH-004 is complete.

No dataset release or production pointer is changed by registry loading, catalog browsing, or configuration validation.

The first managed state-refresh phase adds a separate fixed runtime registry for ten governed sources: Colorado, Connecticut, Florida, Iowa, Illinois, New York, Oregon, Pennsylvania, Texas sales-tax permits, and Washington contractor licenses. Before returning an existing source-refresh plan, the service now verifies the exact builder, verifier export, output root, dataset, connector and policy bindings from safe contained files. Every plan remains `HOLD`; validation performs no network request, allocates no operation, and does not authorize acquisition or a production-pointer change. Dispatch remains deliberately unimplemented until separately reviewed authorization and lifecycle work are complete.

The next safety phase makes Oregon, Illinois, and Washington L&I verification and staged-publication resume cooperatively cancellable. Their build and verification CLIs now accept parent IPC or process-signal cancellation, propagate one abort signal through retained manifest reads and verification, and stop before the release-directory move. Once that move begins, pointer publication remains an uninterrupted commit boundary. Cancellation preserves the prior pointer and retained staging for explicit inspection; it never authorizes automatic resume or enables managed dispatch.

The retained Census ZBP industry view is a separate authenticated, read-only aggregate mode. It verifies the pinned 2023 manifest and every retained ZIP/NAICS artifact before serving one exact published NAICS code, with a 35,000-row ceiling. It never adds hierarchical NAICS rows, treats an absent row as zero, assigns ZIP 99999 to a state, converts a ZIP5 into a polygon without an exact ZCTA code match, or represents annual employer-establishment aggregates as named or currently operating businesses. This view performs no source request and changes no release or pointer.

The Heatmap exposes IRS EO BMF as its own `tax-exempt-organizations` category instead of mixing those records into state registrations. The category counts governed current-extract organization filing-address records and preserves exact ZIP5 evidence; only exact ZIP5-to-ZCTA matches receive polygons. Filing addresses are not verified physical sites or current operations, the cohort is not a complete nonprofit, tax-exempt, or business universe, and record-level review remains local-only.
