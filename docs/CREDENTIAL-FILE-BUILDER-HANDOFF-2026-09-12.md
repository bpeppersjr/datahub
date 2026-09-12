# Credential File Builder handoff — 2026-09-12

Reviewed integration contract only; implement after the typed credential-export service is reviewed. This document does not enable an endpoint, acquisition, export or public redistribution.

## Separate typed mode

Reuse the File Builder and `POST /api/data-operations/exports`, with a closed discriminated request union. An omitted `exportType` preserves the existing business-export behavior. The proposed credential discriminator is `mn-construction-credentials`.

```json
{
  "exportType": "mn-construction-credentials",
  "states": ["MN"],
  "fields": ["credential_category", "credential_number", "reported_state"],
  "format": "csv",
  "policyMode": "local-review"
}
```

The field names above are illustrative, not an approved service schema. Use the reviewed typed-export service's exact field and format allowlists. State filters refer to reported address state, not publisher jurisdiction or inferred physical location.

Credential mode accepts only its reviewed fields/formats/state filters. Reject business categories, arbitrary source IDs or paths, URLs, unknown keys and `public-only`. Resolve and pin the enrolled retained source in the backend; never ask the browser to provide local evidence paths. Keep source observations and unknowns, ZIP5 and ZIP4 separation, and all source policy restrictions.

Use a distinct managed operation kind `credential-export`, with `recordUnit: "publisher-business-credential-row"` and a typed result count such as `credentialRowsWritten`. Do not add these rows to business, organization, physical-site or matching totals. Preserve the existing business-export result contract.

## Existing integration points

| File | Bounded change |
| --- | --- |
| `app/data-operations.tsx` | Add business/credential mode selector, separate field selections and state filters; lock credential use to local review and reset incompatible selections when switching. |
| `app/data-operation-model.ts` | Add credential operation label and typed count/unit/integrity status. |
| `runner/managed-operations.mjs` | Validate request union, dispatch the reviewed typed service, independently verify its operation-bound output, discover only declared artifacts, and recognize the new kind during startup/recovery. |
| `runner/server.mjs` | Existing `/exports` routing can remain if `startExport` dispatches the validated union; no arbitrary new source routes are needed. |
| Managed catalog response | Add a separate `credentialExport` capability/schema; do not append credential fields to the business field catalog. |

Current managed export discovery assumes dataset `flat-business-export`. Credential discovery must have its own exact dataset/manifest verifier rather than weakening that check. Require output under the exact operation directory and hash all declared downloadable artifacts. Successful child exit is insufficient proof. Keep artifacts unavailable until independent verification succeeds; cancellation or uncertain publication requires inspection, not successful export readiness.

Reuse the manager's existing exclusion, cancellation and restart controls. A restarted interrupted export must not run again automatically. The distinct kind must be recognized by the persisted-operation loader and correctly dispatched through existing artifact access rules rather than accidentally falling into a generic business-export branch.

## Publication is not row verification

The separate Minnesota downstream-publication helper establishes that the pinned credential cohort was included in the reviewed completed production release. It must not rewrite original source receipt flags or serve as a substitute for verifying the bytes/rows of a new credential export. Retained publication does not imply current operations, unique businesses, geographic assignment, public export authority or completeness.

## Acceptance tests

1. Legacy business requests and outputs remain unchanged when `exportType` is omitted.
2. Credential mode rejects public policy, unsupported fields, business categories, source/path/URL overrides and malformed discriminator values before launch.
3. Dispatch uses the exact typed service, enrolled input pins, reviewed arguments and operation output path.
4. Wrong operation, release path, byte/hash, count or policy fails independent verification; no downloadable artifact is exposed as successful output.
5. Credential counts retain their record unit and remain outside business/site totals. Original source dates, nullable fields and split ZIPs survive.
6. Before/after-publication cancellation and nonzero exits preserve correct cleanup/recovery evidence without false readiness. Completed evidence survives restart; interrupted ownership never triggers automatic rerun.
7. File Builder mode switching cannot retain incompatible business fields or public settings; credential actions visibly say local review and credential rows.
8. No acquisitions, refreshes, registry rebuilds, production pointer changes or raw business-profile scans are introduced.

Root owns coordinated integration, full checks and runtime verification after the service and UI changes are ready.
