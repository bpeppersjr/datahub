# Wave 1 document-only inquiry proposal

Status: **PROPOSED — NOT APPROVED — NO ACTION AUTHORIZED**

- Proposal ID: `wave-1-document-only-inquiry-20260923-01`
- Proposed jurisdictions: Illinois, Mississippi, Arkansas, Kentucky, Hawaii, Kansas, Nevada, Utah, Washington, and Oklahoma
- Matrix gap basis: `national-goal-completion-20260923152841-e96af677`
- Gap-projection basis: `broad-organization-matrix-gap-projection-2026-09-23T15-28-41.546Z-fb0da2b14f4e`
- Authorization-wave basis: `broad-organization-current-matrix-authorization-wave-2026-09-23T15-28-41.546Z-3ffe3f2022e2`
- Current broad-layer evidence: 11 of 51 jurisdictions admitted; 40 unresolved data gaps
- Packet status: all ten Wave 1 jurisdictions remain `approval-only` and `HOLD`

This proposal does not approve or perform source contact, browsing, acquisition, payment, enrollment, account creation, terms acceptance, row-bearing or business-data downloads, record search, enumeration, scraping, automation, connector work, production execution, publication, or pointer changes. It defines the exact next action that may be taken only after explicit approval naming this proposal ID and the committed document SHA-256.

## Proposed authorized action

If explicitly approved, Co*Tive's governed source-review workstream may:

1. Review publicly available, official, non-row-bearing documentation and unsigned terms for the ten listed jurisdictions.
2. Send bounded document-only inquiries to the official publishing organization asking for contractual and technical answers.
3. Request only non-row-bearing materials: data dictionaries, blank layouts, header-only files, codebooks, file inventories, product descriptions, record-count and byte-count estimates, checksum specifications, cadence and change-contract documentation, and written rights or automation statements.
4. Retain the received documents and correspondence with source URL or sender, observation time, content hash, proposal ID, and state assessment linkage.
5. Update the applicable source assessment to record evidence and unresolved gates. Every state remains `HOLD` unless a later, separately approved authorization clears the relevant gates.

Bounded retrieval and retention of only the enumerated non-row-bearing documents and official response attachments is permitted after approval. No row-bearing sample or business-data product may be requested, opened, downloaded, or retained, even if offered. No purchase, enrollment, account creation, click-through acceptance, portal interaction requiring authentication, or automated retrieval is authorized.

## Required answers for every jurisdiction

Each review or inquiry must seek explicit answers for:

- exact product and covered entity types;
- current statewide control total, estimated rows, files, compressed bytes, and expanded bytes;
- current blank layout or header-only schema and a field-level data dictionary;
- stable organization identifier lifecycle, mergers, conversions, dissolutions, reinstatements, and identifier reuse;
- legal-status codebook and the distinction between filing standing and actual operation;
- organization-controlled physical, mailing, principal, and location address roles, including ZIP5 and ZIP+4 as separate fields;
- person-free projection rules and confirmation that excluded data classes can be omitted before ingestion;
- full-snapshot and delta cadence, effective and publication timestamps, corrections, deletions, tombstones, replay, late arrivals, control totals, and checksums;
- expressly supported unattended retrieval method and rate or scheduling limits;
- retention, transformation, geocoding, commercial use, derived-publication, attribution, and redistribution rights;
- current terms, privacy obligations, migration or deprecation dates, and continuity arrangements.

An unanswered item remains an unresolved gate. Silence, a public-search interface, an example row, or an assertion that records are public does not satisfy a gate.

## Mandatory exclusions

For Illinois, Mississippi, Arkansas, Kentucky, Hawaii, Kansas, Nevada, Utah, and Washington, the proposed person-free projection must exclude:

- natural-person names, roles, and addresses;
- registered agents, service-of-process contacts, and registered-agent addresses;
- direct-contact fields and sensitive or government identifiers;
- filing images, documents, signatures, and unreviewed free text.

For Oklahoma, the stricter projection must exclude:

- registered agents and service-of-process addresses;
- officers, directors, associated people, owners, and other natural persons;
- person addresses, tax identifiers, and telephone numbers;
- stock data, signatures, audit comments, and unreviewed free text.

No response may be treated as proof that a registered entity is currently operating. Registry standing is legal filing status only.

## State-specific inquiry scope

### Illinois

Confirm the exact Corporation and LLC file families, entity-type exclusions, organization-controlled address roles, status codebook, snapshot and refresh contract, permitted non-interactive access, and retention and derived-redistribution rights. Do not query the search database or copy agent or person tables.

### Mississippi

Confirm the full-export route beyond the capped public report, exact scope and current control totals, schema and address roles, status codebook, cadence and correction contract, supported automation, and reuse rights. Do not use filtered search results as a substitute for the statewide product.

### Arkansas

Confirm selectable entity types, the exact statewide listing product, current price basis, schema, identifiers, address roles, status codebook, delivery mechanism, cadence, automation permission, and rights. Do not order or pay for a listing.

### Kentucky

Request the current blank layouts and dictionaries for All Companies and daily or weekly new/change files, along with identifier, status, address, correction, deletion, checksum, automation, privacy, retention, and reuse contracts. Do not subscribe to the paid service.

### Hawaii

Confirm the post-migration portal's current bulk product, continuity with the historical weekly product, schema, identifiers, control totals, price, address and status semantics, cadence, automation, and rights. Treat migration continuity as unresolved until written evidence is retained. Do not use the custom-list builder.

### Kansas

Request current product scope, blank layout, field dictionary, stable identifier contract, status and address codebooks, full/change behavior, automation, privacy, and derived-use rights. Do not enroll in or purchase the paid bulk service.

### Nevada

Confirm whether a current statewide bulk product exists, its exact scope, price, blank schema, stable identifiers, status and address semantics, delivery and refresh contract, automation support, and rights. Do not enumerate Commercial Recordings search results.

### Utah

Confirm whether an official statewide bulk or recurring product exists and request its scope, blank schema, identifiers, status and address semantics, update contract, automation support, privacy exclusions, and rights. Do not automate the registry search.

### Washington

Confirm a safe complete-snapshot route distinct from broad interactive CSV searches, the current CSV schema, identifier lifecycle, ten-year inactive-record behavior, status and address semantics, change contract, automation support, privacy exclusions, and rights. Do not issue broad or repeated Corporation Search queries.

### Oklahoma

Confirm the current 19-table production layout, Filing Number lifecycle, entity Address ID roles, legal-current status mapping, monthly and weekly semantics, correction and deletion behavior, current counts and bytes, timestamps and checksums, scheduled retrieval support, and commercial derived-use rights. Request only a blank or header-only current layout; do not download public sample rows, authenticate, or purchase the master or weekly package.

## Evidence handling and decision rule

Every retained item must be hashed and linked to its jurisdiction, source assessment, acquisition-free observation or correspondence event, and this proposal ID. Original content is retained immutably; interpretations are versioned separately. Conflicting or superseded terms remain preserved with effective and observation times.

After the bounded review, each jurisdiction receives one of these outcomes:

- `HOLD`: one or more gates remain unresolved;
- `DOCUMENTATION_READY`: all required non-row-bearing documentation is retained, but no acquisition is authorized;
- `DECLINED`: the official publisher does not offer a suitable route or required rights;
- `LATER_AUTHORIZATION_REQUIRED`: evidence supports proposing an exact acquisition or enrollment authorization with separately stated rows, bytes, price, transport, exclusions, and operational limits.

`DOCUMENTATION_READY` is not production readiness and does not change the 11/51 collected-data coverage measure.

## Explicit approval syntax

Approval must name both the proposal ID and the committed SHA-256 of this document:

`Approve wave-1-document-only-inquiry-20260923-01 with document SHA-256 <exact-sha256>.`

Any approval that omits either value, names a different value, or adds broader authority is not executable. Approval authorizes only the document-only actions above. Row-bearing requests, row-bearing or business-data downloads, payment, enrollment, account creation, terms acceptance, portal automation, connector development, acquisition, production, publication, and pointer changes require later, separate approvals.
