# Oklahoma business-entity bulk offline contract

Observed 2026-10-03, the official Oklahoma Secretary of State [bulk-order page](https://www.sos.ok.gov/corp/bulkorder/bulkDefault.aspx) still describes a monthly complete database and weekly filing updates using the same 19-record tilde-delimited layout. It lists a $500 master and $150 weekly update. The official [layout](https://www.sos.ok.gov/corp/bulkorder/BulkOrderFileLayoutLegalEntity.htm) publishes record fields, maximum widths, a type-99 trailer, process date, and per-record-type control totals; its HTTP `Last-Modified` remains 2012-11-28. Those facts support offline structural validation, not automated acquisition or a current-schema guarantee.

The connector accepts exactly one operator-supplied `selection.json` and `business-bulk.txt` below `data/imports/oklahoma-business-bulk/packages/<package-id>/`. It verifies the selected SHA-256, canonical paths, closed two-file inventory, UTF-8/LF form, known record types, published field counts and widths, the one terminal trailer, and all 18 trailer counts.

Projection retains type-01 organization evidence, its referenced type-02 administrative address, and type-11/type-12 status/type labels. It excludes agent, officer, associated-person, telephone, tax identifier, filing/audit, stock, document, and free-text content. ZIP5 and ZIP4 remain separate. Registry status is not current-operation evidence, and the administrative address is not a verified physical site.

This workflow performs zero network requests, purchases, account actions, source-pointer changes, or national admissions. Outputs remain `local-review-only`. Oklahoma's stable-key lifecycle, current schema guarantee, status semantics, address role, weekly deletion/correction/replay behavior, checksums, supported automation, retention, derived-use, and redistribution gates remain unresolved.

Use [the example selection](../config/ok-business-bulk-selection.example.json), calculate the source SHA-256 locally, and run:

`node scripts/build-ok-business-bulk-offline.mjs --selection <absolute-selection.json> --output <absolute-new-output-directory>`
