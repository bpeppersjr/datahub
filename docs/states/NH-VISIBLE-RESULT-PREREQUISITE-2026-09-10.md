# New Hampshire visible-result prerequisite

## Implemented boundary

`runner/nh-childcare-visible-results.mjs` defines an independent selected-field projection and normalization contract for the fixed Licensed Group Child Care Program / ZIP5 `03755` public lookup. `scripts/probe-nh-childcare-visible-results.mjs --run` performs one native Playwright lookup without CSV export, detail navigation or a retry loop. This is a prerequisite, not an industry enrollment or a statewide collector.

The projection is limited to rendered program name, observed same-origin detail link and visible address lines. The exact selected query, settled count and rows must agree across two reads. The parser rejects duplicate identifiers, ambiguous links, extra fields, sparse/accessor data, oversized strings and count mismatches. A settled zero is distinct from an unqueried search.

Raw visible address lines are preserved. The renderer's trailing street separator comma is removed only from the normalization input. Only the existing unambiguous two-line US-state/ZIP grammar is normalized; missing, redacted or unsupported address formats remain unresolved. Address ZIP5 and ZIP4 are separate and the query ZIP is never substituted for an address. Coordinates remain null; no business polygons are produced. Source link identifiers are not canonical business identities.

The internal policy is `config/source-policies/nh-childcare-visible-internal.json`. It names DHHS, limits retention to selected internal evidence and prohibits public export. Neither public lookup access nor this project policy establishes a publisher bulk license. Current operations, physical premises, address accuracy and completeness remain unverified.

## Native attempt and actual outcome

One bounded attempt ran at `2026-09-10T17:20:50.970Z`–`2026-09-10T17:20:53.965Z`:

- Run: `17fd999f-3548-4192-bb40-311dda97e4ed`.
- Manifest: `data/business-sources/nh-childcare/visible-result-probes/17fd999f-3548-4192-bb40-311dda97e4ed/manifest.json`.
- Manifest SHA-256: `70bbf31f3a748d6297a2fcea45bc30659cc1d302a0984f552405a48bb17eca4c`.
- Status: `failed-needs-inspection`; last recorded phase: `project-visible-results`.
- One search submission, 70 routed requests, zero download events.
- Network guard recorded a failure; browser cleanup verified.
- No selected source-row artifact, no new accepted business candidates, no source-current or production pointer update.

The original guard recorded only a Boolean failure and the CLI's final-close check replaced its earlier generic failure. This evidence cannot distinguish a source access response, disallowed dependency, request/fulfill failure or shutdown-related failure, nor isolate the rendered selector failure. Do not infer an access ban, a changed source schema, a zero-result search or a successful six-row result.

After this attempt, offline changes added bounded categorical network diagnostics (request-scope, transport, response-policy, fulfill, dispose; numeric status and cancellation flag only), a before-close snapshot, pre-projection counts and fixed per-card structural rejection categories. They preserve the first failure instead of overwriting it during closure. No URLs, source messages, tokens or response content enter these diagnostics. Cleanup uncertainty is explicitly represented as unknown browser-scratch retention. These changes were not followed by another native request in this work.

## Retention, limits and remaining work

The native prerequisite uses a UUID-owned directory under `datahub`, a 90-second deadline, a 120-routed-request guard, at most 20 accepted rows and a 64-KiB selected projection. These are not hard browser disk or total network byte caps. The guard's allowed dependency hosts and existing response behavior are unchanged; it is not a general path-level source policy or a blanket 5xx rejection policy.

The browser must close before its verified-owned scratch is removed. A successful selected projection would be embedded with policy hash, source/query scope, observation time and implementation hashes in an exclusive manifest, reread and rederived before publication and checked again afterward. Failed runs retain diagnostic manifests only unless cleanup itself is uncertain; scratch uncertainty requires inspection. The implementation hashes are snapshots of the listed files, not a claim of a complete signed dependency closure or independently authenticated publisher evidence.

Next source validation must resolve the rendered selector and network failures using the categorical diagnostics; it must not broaden hosts or bypass access controls merely to pass. Until a successful native projection is inspected, do not enroll this as collection-ready, promote rows, claim statewide coverage or use it to fill national counts.

## Validation

Focused offline checks passed 12 tests covering projection, ZIP separation, missing/redacted addresses (including a redacted street with populated city/ZIP), off-query ZIPs, settled zero, malformed/duplicate links, accessors, cancellation, changing snapshots and redacted network diagnostics. These object-level tests do not validate the DOM selectors; the native attempt above is failure-path evidence only.

`npm run check` completed successfully: 1,777 tests, 1,766 passed, 11 skipped, zero failures; lint, web and desktop builds and the desktop control-plane smoke test passed. Log: `data/tmp/nh-visible-results-check.log`. Available PDF, Iowa reporting, retained-cohort, Overture runtime and Oklahoma spatial-inventory checks were enabled. The full log includes the final partial-redaction regression test. Separate type checking passed and the production dependency audit found zero vulnerabilities. No dependency or hosting changes were made; the standalone architecture is preserved.

Oklahoma's exact approved plan hash remained unchanged after this work. Its failed batch was neither retried nor promoted. To roll back this prerequisite, remove its standalone script, projection module and internal policy and revert the additive NH network diagnostics; preserve all historical run evidence. No schedule or industry enrollment needs rollback because none was added.
