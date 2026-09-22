# ZIP denominator audit

## Governed ZIP-quality projection

Schema 1.2 classifies every contract-valid registry ZIP row into exactly one class and publishes a SHA-256 member-set digest for each class:

- `explicit_placeholder`: only the governed literal `00000` rule. It remains in retained source evidence but is not an ordinary ZIP lookup value.
- `valid_format_same_code_governed_zcta`: the ZIP5 has a same-code member in the selected Census ZCTA polygon release.
- `valid_format_source_reported_no_same_code_zcta`: a source reported the syntactically valid ZIP5, but the governed ZCTA set has no same-code polygon.
- `valid_format_denominator_only_no_same_code_zcta`: the registry denominator contains the valid-format ZIP5 without record-level source contribution or a same-code ZCTA.
- `contract_invalid_or_missing`: always zero in a published audit because malformed or absent ZIP5 values fail the audit instead of becoming reportable members.

No other low-number value is called a placeholder without governed evidence. ZIP5 and ZIP4 remain separate physical fields; aggregate ZIP4 is null and has no polygon. The read-only UI/API view pins the registry pointer, manifest, and ZIP artifact hashes through `config/zip-quality-view-enrollment.json` and fails closed on drift. USPS operational status is deliberately `null`; evidence status remains `unverified` with the retained reason. Census ZCTA membership is statistical geography, not proof of USPS operation or deliverability.

`runner/zip-denominator-audit.mjs` provides a deterministic, read-only inspection of the national business registry's ZIP coverage evidence. It answers four separate questions without treating any one source as proof of the others:

- which ZIP5 rows are members of the complete selected governed Census ZCTA5 polygon set;
- which source-reported ZIP5 values are outside that statistical polygon denominator;
- what current USPS operational evidence status and reason each row carries; and
- which proof gaps still prevent a complete current-valid-USPS-ZIP claim.

The audit does not download data, change a current pointer, publish a release, or execute the normalized-postal cutover. It verifies the pointer/manifest relationship and the ZIP artifact's declared byte count, record count, and SHA-256 before reporting any counts. Its audit ID is derived from the audit schema version plus the input pointer, manifest, and artifact hashes, so unchanged inputs under unchanged audit semantics produce the same report and ID.

## Run it

Inspect both the production registry and the isolated normalized-postal candidate:

```powershell
node scripts/audit-zip-denominator.mjs --summary-only --allow-contract-gaps
```

The default report includes exact ZIP5 lists for missing reasons, source-reported values outside ZCTA, and production/candidate set differences. `--summary-only` replaces those lists with counts, set hashes, and deterministic samples. `--include-rows` adds one normalized audit row for every registry ZIP5. `--production-only` or `--candidate-only` limits the input cohort.

Without `--allow-contract-gaps`, the command exits nonzero when a release violates its applicable reason contract. Unresolved USPS proof gaps do not by themselves mean the audit malfunctioned: they remain explicit blockers to a complete current-valid-USPS-ZIP claim. Malformed ZIP5, duplicate ZIP5, invalid geography shapes, unsupported USPS states, escaping paths, or artifact-integrity mismatches always fail closed.

## Evidence contract

For registry publisher 2.10.0 and later, every `current_usps_validity.status = "unverified"` object must include a nonblank `reason`. Registry construction now preserves an existing source-specific reason and supplies this fallback when the source row lacks one:

> No governed authoritative current USPS operational ZIP evidence is integrated for this row; Census or source-reported ZIP5 evidence does not establish current USPS operational status.

The 2.10 verifier rejects a missing reason. It also requires every physical ZIP coverage row to contain `postal_code` exactly equal to `zip_code` and a physically present, separate `zip4` field that is null for this aggregate row. The audit preserves and inspects those actual fields; it does not construct a compatibility alias or invent a null extension. Missing aliases, joined `ZIP5-ZIP4` aliases, mismatches, missing `zip4`, and non-null aggregate `zip4` values are counted as distinct contract failures.

Immutable publisher-2.9 releases are not rewritten retroactively. Their split-field contract is reported as `not-applicable-legacy` and `not-evaluated`; the audit does not fabricate a successful alias or extension. Their missing USPS reasons remain explicit legacy proof gaps. An already-built 2.10 candidate with missing reasons or missing physical split fields fails the new contract and must be rebuilt and independently verified before it can be considered for cutover. ZIP+4 is never joined to ZIP5 and never receives geometry.

## Current read-only result

Against the unchanged pointers on September 3, 2026, audit schema 1.1.0 produces deterministic audit ID `zip-denominator-audit-d48230b5f34ec2e88b360a25`.

| Cohort | Publisher | ZIP5 rows | Governed ZCTA members | Source ZIP5 outside ZCTA | Unverified USPS | Missing reason | Missing alias | Missing `zip4` | Contract |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Production current | 2.9.0 | 48,217 | 33,791 | 14,385 | 48,217 | 4,607 | Not evaluated | Not evaluated | Passed under legacy contract; gaps retained |
| Isolated postal candidate | 2.10.0 | 48,190 | 33,791 | 14,358 | 48,190 | 4,604 | 48,190 | 48,190 | Failed; rebuild required |

Both cohorts have the same governed ZCTA member-set SHA-256, `dd7962961de1a57b2d028e9be4a93dc03ab952354d156ae64b6da1e0c5e2626f`, pinned to geography release `us-census-geography-20260830-132803990Z-3629abc0`. Production contains 29 ZIP5 rows absent from the candidate, while the candidate contains two absent from production; the report preserves their exact set hashes and values when not run in summary-only mode.

All registry ZIP rows remain operationally `unverified` because neither release integrates a governed authoritative current USPS operational ZIP dependency. Census ZCTA membership is official statistical-polygon evidence, not a USPS delivery-boundary or current routing assertion. Source-reported ZIP5 values outside the ZCTA set remain source evidence only, and no ZIP+4 geometry is created.
