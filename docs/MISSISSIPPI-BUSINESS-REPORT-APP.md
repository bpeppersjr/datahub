# Mississippi Business Report managed offline operation

Co*Tive can process one explicitly selected local Mississippi Business Reports package through Data Operations. The package must already exist at `data/imports/mississippi-business-report/packages/<package-id>` and must satisfy the strict offline package contract: one original XLS/XLSX workbook, one operator-derived `records.jsonl`, and one hash-bound `selection.json`.

The operation performs no network request, discovery, query, export, acquisition, account action, payment, or publisher contact. It copies the validated package into a UUID-owned input snapshot, revalidates that snapshot, writes normalized organization-registration evidence to an operation-owned release, and publishes `manifest.json` last. The terminal receipt binds the start record, retained snapshot, release manifest, normalized artifact, counts, and SHA-256 values.

Independent verification reparses the retained snapshot and requires byte-for-byte agreement with `organizations.jsonl`. It also verifies the manifest and every authority claim. The public report's 300,000-row ceiling produces a truncation warning and never establishes statewide completeness.

All output remains `local-review-only`. The operation explicitly makes no source-authenticity, reproducible-extraction, statewide-completeness, current-operation, geocode, physical-site, public-export, national-admission, production-enrollment, or current-pointer claim. It does not change the Mississippi broad-organization gap.

Cooperative cancellation removes only the operation-owned unpublished release and snapshot, then retains a `CANCELLED` terminal receipt. Failed operations similarly retain an inspection-required terminal receipt. The original operator package is never modified.

CLI equivalents:

```powershell
npm run mississippi-business-report:app -- --package data/imports/mississippi-business-report/packages/<package-id>
npm run mississippi-business-report:verify-app -- --receipt data/imports/mississippi-business-report/operations/<operation-id>/receipt.json
```
