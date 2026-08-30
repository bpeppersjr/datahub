# Co*Tive Collector development agents

This file defines the durable working agreement for agents developing this repository.

## Mission

Evolve Co*Tive Collector from a single-user local job runner into a governed, recoverable data hub without losing its standalone Windows experience or its rule that all local artifacts remain inside `datahub`.

## Operating model

The primary agent is the integrator. It owns scope, sequencing, cross-module decisions, verification, and the final Git change. Specialist agents inspect or implement bounded workstreams and report evidence back to the integrator. Parallel agents must not edit overlapping files.

Use a modular monolith until measured workload or deployment requirements justify distributed services. New connectors must use shared contracts rather than adding another special case to `runner/server.mjs`, `runner/worker.mjs`, and `app/page.tsx`.

## Agent roster

| Agent | Owns | Required outputs |
|---|---|---|
| Platform architecture | Contracts, module boundaries, ADRs, dependency direction | Architecture impact, migration path, compatibility risks |
| Orchestration platform | Durable queue, workflows, leases, retries, cancellation, recovery | State transitions, failure behavior, recovery tests |
| Connector engineering | Source discovery, acquisition, provider adapters, checkpoints | Manifest, schemas, policy profile, offline conformance fixtures |
| Data engineering | Normalization, canonical entities, provenance, entity resolution, quality | Data contracts, lineage, quality metrics, reconciliation evidence |
| Security and governance | Local API trust, secrets, SSRF/path controls, source terms, retention | Threat impact, policy decisions, negative tests, redaction evidence |
| UI and observability | Typed forms, workflow/run views, dataset catalog, events and metrics | Operator workflow, accessible states, error/recovery visibility |
| Verification and release | Test strategy, fault injection, packaging, migrations, supply chain | Reproducible checks, release evidence, rollback notes |

One agent may cover multiple roles for a small change, but the responsibilities remain separate and must be explicitly checked.

## Non-negotiable boundaries

- Keep runtime files, downloads, browser binaries, caches, databases, and outputs inside `datahub`.
- Bind the management service to loopback unless an authenticated and explicitly approved remote mode exists.
- Never store API keys, bearer tokens, cookies, or licensed credentials in job JSON, logs, manifests, fixtures, or outputs.
- Do not use proxy rotation, CAPTCHA bypass, identity hiding, or access-alert evasion.
- Every source must have a policy profile covering ownership, terms, allowed use, retention, attribution, and redistribution.
- Keep public, licensed, and provider-restricted data in separate source layers. Apply field-level export policy before publishing combined data.
- Preserve source-native records and provenance. Do not silently overwrite, guess, or flatten one-to-many relationships.
- Use cooperative cancellation before forced termination. A cancelled job must not leave a blocking lock, live child process, or unpublished artifact.
- Scope checkpoints, staging paths, and outputs by immutable run ID. Publish manifests last and atomically.
- Do not call paid APIs, initiate large downloads, delete material runtime data, or change external systems unless the user has authorized that action.

## Required connector contract

Every connector must declare a versioned manifest containing:

- connector ID and version;
- configuration and output schemas;
- named secret references;
- input and output artifact types;
- allowed hosts and redirect policy;
- provider rate-limit and budget key;
- resource class and execution limits;
- retry, checkpoint, idempotency, and cancellation behavior;
- source policy and retention profile;
- produced entity and identifier types.

The lifecycle contract is:

```text
preflight -> plan -> acquire -> validate -> normalize
          -> reconcile -> quality gate -> publish -> finalize
```

Prerequisites are explicit workflow steps. They must not be hidden inside a dependent connector.

## Canonical data boundary

Model organizations, brands, physical sites, operating establishments, services, classifications, and external identifiers separately. A grocery store with an in-store pharmacy is two establishments sharing one physical site. NPI, NCPDP ID, SNAP retailer ID, Google Place ID, and provider IDs are typed external identifiers, not canonical primary keys.

Every published field must be traceable to source record, source release, ingest run, transformation version, and policy profile. Temporal facts use `first_seen`, `last_seen`, `valid_from`, and `valid_to` where applicable.

## Change workflow

1. Inspect repository instructions, Git status, affected contracts, and relevant tests.
2. State scope, assumptions, risks, and the owning agent role.
3. Add or update the contract and acceptance tests before expanding implementation.
4. Make the smallest coherent migration with backward compatibility where practical.
5. Test happy path, invalid input, cancellation, retry, restart, concurrency, retention, and secret redaction in proportion to risk.
6. Run `npm run check` and `npm audit --omit=dev`; add focused integration or packaging checks when relevant.
7. Report files changed, verification evidence, known limitations, migration impact, and rollback instructions.

## Definition of done

A change is not complete until configuration is validated before execution, state transitions are durable, artifacts are run-scoped and checksummed, errors are actionable and redacted, cleanup and restart behavior are tested, provenance and policy metadata are preserved, documentation is updated, and the full repository check passes.

The ordered program backlog is maintained in `docs/DEVELOPMENT-ROADMAP.md`.
