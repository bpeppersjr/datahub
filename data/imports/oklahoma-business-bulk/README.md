# Oklahoma SOS business bulk offline package

Place one operator-supplied package at `packages/<package-id>/` containing exactly `selection.json` and `business-bulk.txt`. This workflow never downloads or purchases the source.

`selection.json` must use `ok-business-bulk-selection@1.0.0`, bind the source SHA-256 and observation timestamp, and set `operator_supplied` true while all four acquisition, purchase, pointer, and admission authorizations are false. The text file must be LF-terminated UTF-8, follow the official 19-record tilde layout, end in one type-99 trailer, and match every trailer record count.

The projector retains only type-01 organization evidence, type-02 administrative address, and type-11/type-12 lookup labels. It excludes agents, officers, associated parties, contact details, tax identifiers, filing/audit text, stock data, and documents. ZIP5 and ZIP4 remain separate. Output is local-review-only and does not assert a physical site, current operation, statewide completeness, national admission, or a production pointer.

The lower-level command is `node scripts/build-ok-business-bulk-offline.mjs --selection <absolute-selection.json> --output <absolute-new-output-directory>`.

Run `node scripts/run-ok-business-bulk-app.mjs --selection data/imports/oklahoma-business-bulk/packages/<package-id>/selection.json`. Each accepted run creates a UUID directory under `operations/`, durably writes `start.json`, processes an operation-owned verified snapshot, and writes a terminal `receipt.json`. Verify successful evidence with `node scripts/verify-ok-business-bulk-app.mjs --receipt data/imports/oklahoma-business-bulk/operations/<operation-id>/receipt.json`.

The worker has no network, purchase, or account capability. It changes no source/current pointer and performs no national admission. Output is local-review-only; administrative addresses are not physical-site claims and registry status is not proof of current operation.
