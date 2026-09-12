# Retained nursing-home chain assertions

Independent, read-only `cms-nursing-home-chain-reporting-input@1.0.0`. This is a new in-memory view, not a replacement for the selected nursing projection, recovery receipt, registry or production plan. No source request, publication, copy or pointer change is performed.

## Publisher meaning and evidence

The retained July 2026 CMS Nursing Home Data Dictionary, SHA-256 `2b55b0f65532e36fe7c49967993a37ddcb8c92e38234c94a2652c9a77feeb313` (644,126 bytes), was rehashed and its complete rendered pages 8 and 27 inspected. Table 2 defines a chain as a group sharing at least one owner (individual or organization), officer, or operational/managerial-control entity. Chain ID is the publisher's unique numeric identifier; the facility-count field is missing for a provider outside a chain. Table 16 records the July 2025 rename from Affiliated Entity to Chain and addition of chain-size fields. These definitions do not establish a legal parent, healthcare network, canonical company, physical-site identity or independently verified current operations.

`loadCmsNursingHomeChainReportingInput({signal?})` accepts only cancellation, never alternate source paths/pins. It invokes the fixed nursing reporting loader/full recovery verification before and after projection. The original failed-source CSV is read with bounded single-link, regular-file, canonical-parent and stable identity checks, pinned to 9,151,628 bytes / `a5808fcded1ca73a629fde88fc23dcba3b6ff8ed75199883062a262e14ef8fe0`. A final bounded raw read checks hash and identity again after the second recovery replay. Evidence retains recovery `89ee608067aa5b97833957b753be61003dc2efcfa22cfaedbb3b78f020396d7e`, all twelve failed-source file pins, dictionary, selected artifact, source dates and distinct observation/recovery clocks. Existing source and recovery files are untouched.

Each CSV row must match its retained selected row's exact CCN, logical source-row number, CSV hash and source-record ID. Duplicate CCNs or changed membership fail. The reader requires exact selected chain headers plus processing date; other source columns are not returned. It preserves raw Chain Name, Chain ID, Number of Facilities in Chain and Processing Date strings. Numeric IDs stay strings, including leading zeros; no numeric coercion or merging is applied to IDs. Counts additionally expose a positive safe-integer interpretation when lexically valid. Blank/whitespace-only fields are marked missing without changing raw values; other placeholders are not guessed. Controls and invalid lexical values remain annotated, not silently normalized.

All directory rows remain represented. Missing name/ID contradictions, count without ID, ID without count and unresolved lexical fields are row flags. Only digit-only IDs form publisher groups; missing and unresolved IDs remain separately counted. Group summaries retain distinct raw names and distinct reported counts, mark conflicting names/counts, missing/invalid counts and differences from observed retained membership. Count disagreement is evidence, not a fatal invariant or a reason to alter/drop rows. Repeated names across different IDs are reported without merging. Row flags and group reconciliation are separate dimensions; a group count discrepancy need not create a row flag.

Claims always deny canonical-entity counts, legal-parent/network/current-operation verification and public export. Output is local-review-only. Consumers must not add publisher-group counts to business totals. There is no long-lived cache, global snapshot or implicit reuse; each explicit native load fully verifies its fixed retained source. Returned snapshots are deeply frozen. The separate fixture API always marks evidence synthetic, even when supplied structurally valid rows.

## Bounds and verification

Raw input is capped at 32 MiB, 25,000 rows, 128 columns and 65,536 characters per CSV record; each exposed chain string is capped at 4,096 characters. File reads check cancellation each 64 KiB and close handles in `finally`. Projection yields every 128 rows and destroys its parser on failure/cancellation. CSV/decoding errors are fixed messages, not source-value dumps. The caller supplies the native deadline; validation used 180 seconds with global fetch forbidden. This is cooperative cancellation, not an OS-enforced deadline: initial bounded UTF-8 decoding and parser.end consume the CSV synchronously before row yields; grouping is also bounded synchronous work with signal checks. Timer expiry is observed once the event loop can process it.

Six focused tests and owned-file ESLint pass. Tests cover raw-value/zero preservation, contradictory counts/names/missingness, cross-ID name cardinality, source-row/hash/CCN mismatch, duplicate headers, sparse linkage, malformed UTF-8/CSV with error redaction, pre-abort, mid-projection abort and actual 1 ms timer expiry observed at a yield. The actual retained native read completed in about 3.2 seconds, returning only an aggregate proof to test output:

| Measure | Retained observation |
| --- | ---: |
| Conserved directory rows | 14,690 |
| Rows with digit-only chain IDs | 10,116 |
| Rows missing chain IDs | 4,574 |
| Unresolved IDs / row flags | 0 / 0 |
| Distinct publisher chain IDs | 610 |
| Groups matching reported membership count | 610 |
| Groups with name variants / names shared across IDs | 0 / 0 |

These are fixed-cohort observations, not permanent source invariants. No raw name/contact values were logged and no output artifact was published. The first native check caught incorrect use of the shared canonical-directory utility on a file path; the call was corrected to the parent directory while retaining independent file identity checks, then all six tests passed. No network operation or source retry occurred.

Remaining integration: a separately governed consumer may expose these source assertions or admit a versioned artifact with its own immutable manifest. That requires explicit integration and policy tests; this loader alone changes no application or registry behavior.
