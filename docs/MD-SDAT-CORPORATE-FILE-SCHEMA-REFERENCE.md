# Maryland SDAT Corporate File schema reference

This standalone documentation prerequisite records observations dated November 13, 2026. Maryland remains **HOLD**: `current_schema_compatibility_verified=false`, `connector_ready=false`, `acquisition_authorized=false`, and `required_source_files=0`. All authority flags are false. No PDF or source records are retained and no broad-layer gap is resolved. This adds no connector, application workflow, scheduled acquisition or readiness-wave admission.

The versioned evidence is `config/state-business-source-assessments/md-schema-reference-2026-11-13.json`. It supplements, without changing, the immutable October 3 assessment. The strict loader pins both file bytes and parsed content and rejects missing/extra fields, altered policy, citations, permissions or schema claims. New reviewed facts require a separately versioned artifact and loader update.

[SDAT services](https://dat.maryland.gov/Pages/Services.aspx) designates SpecPrint and describes corporations, limited partnerships, LLCs, LLPs and trade names, entities active since 1982, principal office/resident agent fields, monthly master creation and weekly subscriptions. This describes a registry product, not current operating establishments or statewide business completeness. The [SDAT website usage statement](https://dat.maryland.gov/about/Pages/Website-Usage-Statements.aspx) says data mining software access will be blocked and directs data availability to SpecPrint. Interactive search automation and data mining remain prohibited in this prerequisite.

The [designated contractor pricing page](https://www.specprint.com/state_prc.html) lists $2,100 per Corporate File, 9,300,000 average weekly records, preferred FTP delivery and advance payment. The record count is not a verified unique-entity denominator. Pricing does not establish subscription terms, unattended retrieval permission or downstream rights.

The [Corporate File layout](https://specprint.com/spec/CORP%20FILE%20LAYOUT.pdf) was retrievable as a 110,151-byte PDF. Its observed SHA-256 is recorded in the JSON, with retrieval evidence attributed to the coordinating agent. No reviewed layout version/date or compatibility promise exists. Previously reviewed 25-table positional-layout facts include BUSENTIT, BUSADDRE, ENTITYST, candidate key fields ID_BUS_PREFIX plus ID_BUS (CHAR 16), AD_ZIP (CHAR 9), and FL_ACTIVE with unresolved allowed values. These are documentary constraints, not a delivered-file schema contract. Encoding, joins, stable identifiers, address roles and code dictionaries remain unresolved. Preserve one-to-many relationships, source-native identifiers, and separate ZIP5/ZIP4 if a later authorized contract supports implementation.

Generic .NET HttpClient returned HTTP 406 with 300-byte HTML for SpecPrint documentation pages, while browser retrieval succeeded. This records transport behavior only. It establishes no source-file access permission or authority to evade controls.

Before a separate connector or acquisition can be approved, establish current schema compatibility, encoding, status/address dictionaries, identifier lifecycle, full/delta and deletion semantics, completeness/checksums, supported automation, current terms and price, privacy exclusions, retention and downstream use rights. No source request, order, payment, account, contact or terms acceptance is authorized by this artifact.

Verification (offline, no app launch):

```powershell
node scripts/verify-md-sdat-corporate-file-schema-reference.mjs
node --test runner/md-sdat-corporate-file-schema-reference.test.mjs
npx eslint runner/md-sdat-corporate-file-schema-reference.mjs runner/md-sdat-corporate-file-schema-reference.test.mjs scripts/verify-md-sdat-corporate-file-schema-reference.mjs
```

Tests cover immutable assessment preservation, absence from the connector readiness wave, retention and authority boundaries, transport qualification, search/data-mining restrictions, invalid input, missing evidence and evidence tampering. There are no runtime state transitions, retry, cancellation, acquisition or recovery claims to migrate. Rollback consists of removing the five new standalone files; no production state or prior assessment changes are required.
