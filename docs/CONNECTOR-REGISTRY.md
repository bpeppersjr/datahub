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
