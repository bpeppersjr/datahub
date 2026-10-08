# Kentucky Business Entity managed offline operation

Co*Tive can process one explicitly selected Kentucky SOS company-family package already present at `data/imports/kentucky-business-entity-bulk/packages/<package-id>`. The package must satisfy the strict offline contract: exactly `selection.json` and `companies.txt`; officer files and all unexpected files are rejected.

The operation performs no network request, discovery, acquisition, account action, payment, terms acceptance, or publisher contact. It snapshots the package into a UUID-owned operation, validates the official 42-field company-family shape, excludes registered-agent/applicant/person fields from normalized output, and writes `manifest.json` last.

Verification independently reparses the retained snapshot and requires byte-for-byte agreement with the private `organizations.jsonl` release. ZIP5 and ZIP4 remain separate nullable fields. Administrative addresses are not physical-site assertions and may be residential or out of state.

Raw input remains `person-bearing-internal`; minimized output remains `local-review-only`. No source-authenticity, statewide-completeness, current-operation, geocode, physical-site, public-export, national-admission, production-enrollment, or pointer claim is made. The operation does not remove Kentucky's broad-organization gap.

Cooperative cancellation removes only operation-owned unpublished artifacts and retains a `CANCELLED` receipt. Restart recovery fails abandoned work when both recorded owners are absent and prevents silent duplicate execution.

```powershell
npm run kentucky-business-entity:app -- --package data/imports/kentucky-business-entity-bulk/packages/<package-id>
npm run kentucky-business-entity:verify-app -- --receipt data/imports/kentucky-business-entity-bulk/operations/<operation-id>/receipt.json
```
