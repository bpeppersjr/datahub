# Credential File Builder handoff — 2026-09-12

Managed integration implemented; focused service/lifecycle tests and actual desktop acceptance passed. Full-check release verification remains pending. This adds no acquisition or public redistribution authority.

## Separate typed mode

Reuse the File Builder and `POST /api/data-operations/exports`, with a closed discriminated request union. An omitted `exportType` preserves the existing business-export behavior. The proposed credential discriminator is `mn-construction-credentials`.

```json
{
  "exportType": "mn-construction-credentials",
  "states": ["MN"],
  "fields": ["credential_category", "credential_identifier", "reported_state"],
  "format": "csv",
  "policyMode": "local-review-only"
}
```

The implemented UI uses the exact `MN_CREDENTIAL_FLAT_FIELDS` and required provenance allowlists. Credential identity is `credential_identifier`, and policy is `local-review-only`. State filters refer to reported address state, not publisher jurisdiction or inferred physical location.

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

## Implemented lifecycle

`credential-export` operations dispatch only `scripts/export-managed-mn-credentials.mjs`. The fixed retained selection and local-only policy are backend-owned; callers provide only the discriminator, fields, reported states and format. Required provenance fields are inserted by service validation. Managed manifests use `mn-credential-flat-export@1.1.0` with an operation ID and exact `<operation>/output/jobs/<UUID>/manifest.json` location; standalone global UUID exports retain version 1.0 and their existing verifier unchanged.

Successful child exit is followed by independent native source/row verification, requested field/state/format matching and artifact hashes before readiness. Verification receives cancellation signals, including during post-child replay/hashing. Failed, cancelled or uncertain operations expose no artifact and retain the operation directory for inspection. Startup recognizes this distinct kind and never automatically reruns interrupted exports. Download-time verification rechecks the typed export and hides artifacts after detected drift. Public operation responses omit private manifest-path descriptors and report credential counts separately from business counts.

Focused service/managed tests passed 35/35, including synthetic dependency-injected lifecycle cases; these are not claims of a native acquisition. `scripts/verify-credential-file-builder.mjs` is an explicit runtime acceptance check that creates one small WY-reported-state export from retained data, exercises mode reset, locked policy, required fields and 200% usability, and checks native/unknown publication display. It must be run only within the authorized runtime-validation workflow, after `stop-collector.bat`.

Actual desktop acceptance succeeded for managed operation `8a46d759-8aa4-4c3a-98ef-fd63c28d079f`: one WY-reported credential row, independently verified, JSONL 1,593 bytes and manifest 2,471 bytes. The real download button saved `downloads/credentials.jsonl`; saved bytes, row count, reported state, credential unit and historical false flag were checked. The completed operation remained visible after desktop restart. Receipt SHA-256: `661adbe2cf227d7b58ac66afab8b1935daa8a7c6e20afa906d3cc1a36a58ce21`. Log: `data/ui-verification/credential-file-builder-native-ui-final.log`. Earlier UI-selector attempts failed before dispatch and created no operation. Only this one managed validation export was created; retained source data and production pointers were unchanged.

Final combined validation on 2026-09-12 passed: `npm run check` exited 0, with 1,948 tests (1,888 passed, 60 explicitly skipped, zero failures), lint, both builds and desktop control-plane smoke. Log: `data/ui-verification/check-credential-file-builder-clean.log`. The prior run exposed one isolated HTTP fixture missing the exporter's new static dependency closure; its failure log remains `check-credential-file-builder-final.log`. The fixture-only repair and import smoke passed all three focused API tests (`credential-managed-api-fixture-fix.log`) before the clean full run. No production error redaction or export behavior was weakened. Optional retained-input/platform skips are not native proof; the separate native acceptance above supplies this slice's actual local retained-export evidence. `npx tsc --noEmit` and `npm audit --omit=dev` exited 0; audit found zero vulnerabilities (`credential-final-tsc-audit.log`). Implementation/testing used the disclosed supported Astra fallback while Spark was unavailable.

After running `stop-collector.bat`, `launch-datahub.bat` succeeded and left Co*Tive Collector open (Electron PID 6936, observed 2026-09-12T13:55:23.660Z; runner listening at 13:55:19.457Z). Health, business coverage, dataset representation, authenticated schedules and the validation operation returned HTTP 200. Schedules remained empty; the operation remained `SUCCEEDED`, one credential row, `artifactIntegrityVerified:true`. Dataset representation retained 51 jurisdictions, version `national-reporting-eight@1.0.0` and unknown all-business completeness (`null`). No collection or production rebuild was performed. A failed diagnostic setup's test-only directory `data/test-runtime/managed-api-a20320b7-a495-41aa-9c6b-db4b1222d049` was preserved after cleanup was denied by the execution policy; it contains only copied fixture implementation/configuration, not new acquired data.
