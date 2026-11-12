# Mississippi Business Reports intake readiness

In **Data Operations**, select **Check Mississippi Business Report intake** and enter `data/imports/mississippi-business-report/packages/<package-id>`. Use an opaque package ID and place the operator-supplied original in that directory before starting. Co*Tive works offline on the selected package. Intake produces private readiness metadata and leaves Mississippi’s broad-organization coverage open.

## Package contract

Create `selection.json` with `schema_version` set to `mississippi-business-report-package@2.0.0`. Set `package_id` to the directory name, `observed_at` to the export observation in UTC with milliseconds, and `source` to the publisher URL in the [selection schema](../config/schemas/mississippi-business-report-intake-selection.schema.json). Set `format` to `xlsx` and `sheet_name` to the exact workbook sheet name. Every supplied file descriptor gives the fixed `path`, byte count and SHA-256 digest. Use `null` for an absent companion or evidence file. The selection and described files form the complete package inventory.

| Role | Path | Contents |
| --- | --- | --- |
| `ORIGINAL` | `original.xlsx` | Unmodified Mississippi SOS Business Reports Excel export supplied by the operator. |
| `CSV_COMPANION` | `export.csv` | Optional UTF-8 rendition of the same ordered rows and columns. Its deterministic projection must agree with the XLSX. |
| `SOURCE_EVIDENCE` | `source-evidence.json` | Structured operator attestation of the publisher, observation time and exact original digest, plus a digest of the supporting source documentation. |
| `RIGHTS_EVIDENCE` | `rights-evidence.json` | Structured operator attestation of written publisher permission, tied to the original and supporting document digests. Local retention and derived use require separate true flags. |

The selection schema defines both evidence envelopes. Keep supporting documents in separately governed storage. The intake package holds their digests and the structured attestations. A CSV-only package can use `original.csv`, `format: "csv"` and `sheet_name: null` to check the row contract. Its original workbook gate stays blocked. For a legacy `original.xls` package, use `format: "xls"` and `sheet_name: null`. The extraction gate reports `unsupported-format`.

### Extraction contract

The XLSX profile accepts one visible worksheet matching `sheet_name`, with headers on row 1 and contiguous record rows. It accepts standard, bounded ZIP and SpreadsheetML, including inline and shared strings. It rejects extra sheets or columns, hidden rows, formulas, merged cells, embedded or external content, and malformed XML. The XLSX and CSV files may each contain up to 64 MiB. XLSX is bounded to 32 ZIP parts and 256 MiB declared expansion, with actual size and CRC verified for every parsed part. The report ceiling is 300,000 rows. At that ceiling the app records possible truncation. A header-only input records `empty-export`.

The ordered columns are `Business Name`, `Business ID`, `Other Business Name 1`, `Other Business Name 2`, `Profile Type`, `Domicile Type`, `Status`, `NAICS Code 1`, `NAICS Code 2`, `NAICS Code 3`, `Principal Address`, `City`, `State`, `County`, `Postal Code` and `Formation Date`. Additional person, registered-agent, officer and contact columns fail the roster check. Organization names and principal addresses can themselves contain personal or residential information. The operation emits only aggregate counts and a projection digest.

Business names are required and business IDs must be unique strings of six or seven digits. Status stays a source registry label and blanks stay blank. The principal address has an administrative registration role. State must be blank or a two-letter uppercase value. Postal codes must be blank or text ZIP5, nine-digit ZIP, or ZIP5 with a hyphen and ZIP4. Extraction separates ZIP5 and ZIP4 and preserves leading zeros. Numeric postal cells are rejected. The projection also avoids styling, date conversion, geocoding and address inference. The optional CSV companion must match the ordered projection after this same ZIP separation.

### Readiness gates

- `blocked` means a required original, evidence scope, extraction or CSV agreement gate did not pass. A malformed envelope, unexpected file, or hash mismatch fails the operation with a redacted receipt.
- `operator-attested-awaiting-independent-review` means the XLSX and supplied CSV passed structural extraction and the two operator attestations met the envelope and scope checks.
- `ready-for-normalization-review` additionally requires a matching entry in the app-governed [independent review pin registry](../config/mississippi-business-report-review-pins.json). Each authorized entry binds the selection, original, optional CSV, source evidence and rights evidence digests and records separate source, local retention and derived-use reviews. The checked-in registry starts empty. Operators cannot add review pins through a package or the Data Operations form.

A successful operation means the report was written and independently verified. Its readiness status determines which gates passed. Review-pin matching records a governance step. Source authenticity, retention and derived-use rights, current operation, site identity, statewide completeness, redistribution, admission and production claims remain false.

## Receipts and recovery

The operation retains `start.json`, `readiness/report.json`, `readiness/manifest.json` and `receipt.json` under `data/imports/mississippi-business-report/operations/<operation-id>/`. It writes the report first, publishes the manifest last in the readiness directory, then records the terminal receipt. The managed API exposes a private summary and no downloads. Independent verification reparses the original operator package and checks the report and manifest byte for byte. Preserve the original package to reproduce the report. Verification of a previously matched review also requires its pin to remain in the governed registry.

One intake worker can hold the lock at a time. Cooperative cancellation removes unpublished readiness files and records `CANCELLED`. A later run can recover an interrupted worker after the owning process exits. It records `FAILED` on the prior incomplete run and uses a fresh operation ID. An unresolved lock requires inspection. Existing v1 receipts can still be verified through the same CLI. New managed operations require a v2 intake package.

```powershell
npm run mississippi-business-report:app -- --package data/imports/mississippi-business-report/packages/<package-id>
npm run mississippi-business-report:verify-app -- --receipt data/imports/mississippi-business-report/operations/<operation-id>/receipt.json
```
