# Alaska Corporations offline packages

Place one operator-supplied CSV in `packages/<package-id>/`. The directory must contain exactly that CSV and `selection.json`; source files are intentionally not bundled with Co*Tive.

```json
{"schema_version":"ak-corporations-import-selection@1.0.0","package_id":"example-2026-10","source":{"file":"CorporationsDownload.csv","sha256":"<64 lowercase hexadecimal characters>"}}
```

Run `node scripts/run-ak-corporations-app.mjs --selection data/imports/ak-corporations/packages/<package-id>/selection.json`, then `node scripts/verify-ak-corporations-app.mjs --receipt data/imports/ak-corporations/operations/<run-id>/receipt.json`.

The operation is zero-network. It uses an exact operation-owned input snapshot only while building and independently verifying the local-review release, then removes that raw snapshot because excluded registered-agent/person-bearing fields may be present. Durable start and terminal receipts bind the stable release to the selected input hash and byte count. It creates no current pointer and grants no production, national registry, coverage, or Heatmap admission.
