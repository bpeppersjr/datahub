# Oklahoma business-entity bulk offline contract

Observed 2026-10-03, the official Oklahoma Secretary of State [bulk-order page](https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx) still describes a monthly complete database and weekly filing updates using the same 19-record tilde-delimited layout. It lists a $500 master and $150 weekly update. The official [layout](https://www.sos.ok.gov/corp/bulkorder/BulkOrderFileLayoutLegalEntity.htm) publishes record fields, maximum widths, a type-99 trailer, process date, and per-record-type control totals; its HTTP `Last-Modified` remains 2012-11-28. Those facts support offline structural validation, not automated acquisition or a current-schema guarantee.

The connector accepts exactly one operator-supplied `selection.json` and `business-bulk.txt` below `data/imports/oklahoma-business-bulk/packages/<package-id>/`. It verifies the selected SHA-256, canonical paths, closed two-file inventory, UTF-8/LF form, known record types, published field counts and widths, the one terminal trailer, and all 18 trailer counts.

Projection retains type-01 organization evidence, its referenced type-02 administrative address, and type-11/type-12 status/type labels. It excludes agent, officer, associated-person, telephone, tax identifier, filing/audit, stock, document, and free-text content. ZIP5 and ZIP4 remain separate. Registry status is not current-operation evidence, and the administrative address is not a verified physical site.

This workflow performs zero network requests, purchases, account actions, source-pointer changes, or national admissions. Outputs remain `local-review-only`. Oklahoma's stable-key lifecycle, current schema guarantee, status semantics, address role, weekly deletion/correction/replay behavior, checksums, supported automation, retention, derived-use, and redistribution gates remain unresolved.

Use [the example selection](../config/ok-business-bulk-selection.example.json), calculate the source SHA-256 locally, and run:

`node scripts/build-ok-business-bulk-offline.mjs --selection <absolute-selection.json> --output <absolute-new-output-directory>`

## Standalone application handoff

The preferred durable entry point is `node scripts/run-ok-business-bulk-app.mjs --selection data/imports/oklahoma-business-bulk/packages/<package-id>/selection.json`. It creates a UUID operation below `data/imports/oklahoma-business-bulk/operations`, persists a start record before processing, copies the closed package into an operation-owned snapshot, builds an operation-owned release, removes the temporary snapshot, and publishes a terminal receipt. Failure or cancellation removes only that operation's snapshot and incomplete release; the operator package is preserved.

`node scripts/verify-ok-business-bulk-app.mjs --receipt data/imports/oklahoma-business-bulk/operations/<operation-id>/receipt.json` independently replays receipt, hash, row-count, provenance, and policy assertions. The wrapper cannot perform network requests, purchases, account actions, source/current pointer changes, or national admission. Its output remains local-review-only and preserves the explicit no-physical-site and no-current-operation claims. The managed server and Data Operations UI can dispatch this worker through `ok-business-bulk` for an explicitly selected local package, then independently verify its receipt. Enrollment alone proves no successful operation; the package and operation directories were empty during the October 3 reassessment.

The official [SOS disclaimer](https://www.sos.ok.gov/feedback/disclaimer.aspx), reviewed October 3, states that filing records may include personal information and may be shared subject to applicable redactions; it also disclaims accuracy and timeliness warranties. Public availability is not treated as an express commercial bulk redistribution grant. No sample rows, package, account, purchase or source contact was used for this review.
