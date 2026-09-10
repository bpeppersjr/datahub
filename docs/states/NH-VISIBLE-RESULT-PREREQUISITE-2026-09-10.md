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

## Subsequent diagnostic validation and selector correction

One further fixed-lookup validation used the categorical diagnostics at `2026-09-10T17:32:21.876Z`–`2026-09-10T17:32:24.506Z`:

- Run: `6437fb3e-6c83-4245-b87d-0fc6173d117b`.
- Manifest: `data/business-sources/nh-childcare/visible-result-probes/6437fb3e-6c83-4245-b87d-0fc6173d117b/manifest.json`.
- SHA-256: `fafa73702e222cd8a7123c496152b7f60c01603fc9494893d416537e6e8c947e`.
- One search submission, six displayed results and six visible cards, but all six rejected as `ambiguous-detail-parent`.
- Eight request-scope blocks before browser closure; one additional transport failure during closure. No recorded HTTP 401, 403 or 429. A local scope block is not proof of a publisher denial.
- Zero downloads, zero accepted rows, verified browser cleanup and no retained browser scratch.

A subsequent bounded read-only GET of the public search page returned HTTP 200 and 250,352 decoded bytes. Inspection of the public rendering code established that both the business/address column and separate contact column use `.slds-tile__detail`. The extractor's requirement that this class appear exactly once was wrong. This GET made no search submission and no new business observation; its body was not retained as a dataset.

`runner/nh-childcare-visible-dom.mjs` now identifies the business parent by its direct initial-paragraph detail link. It does not select the contact column by position or read its text. The CLI shares this exact serialized callback with a new offline browser fixture. The fixture tests both column orders, exclusion of contact/directions/accessibility text, duplicate business parents, extra anchors, unsupported address descendants, hidden name fields and foreign detail origins. It made zero network requests and removed only its verified-owned UUID scratch directory.

The network guard's enforcement and host allowlist are unchanged. Its next diagnostic record can distinguish cancellation, request budget, credentials, port, protocol and unsupported hosts. A bounded DNS hostname and an enumerated resource type can be recorded, but URL paths, query strings, credentials, source exception messages and response content remain excluded. Credential-bearing requests do not expose their hostname. These diagnostic changes do not authorize any blocked request.

The revised projector and network diagnostics passed 14 focused checks with `DATAHUB_TEST_NH_VISIBLE_DOM=1`. The browser fixture is opt-in and must not be claimed as passed by a default run that skips it. A successful live projection with this corrected selector remains unverified; no further live lookup was made after these changes. The New Hampshire source is still not enrolled or collection-ready.

Final full-suite validation for this revision passed: 1,779 tests, 1,768 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. `DATAHUB_TEST_NH_VISIBLE_DOM=1` was enabled alongside the previous PDF, Iowa reporting, retained-cohort, Overture runtime and Oklahoma inventory flags. The log explicitly records the offline browser test passing: `data/tmp/nh-visible-dom-check.log`. Separate type checking passed and the production dependency audit found zero vulnerabilities. Oklahoma's approved scope hash remained unchanged. No source policy, host allowlist, schedule, production pointer, dependency or hosting configuration was broadened.

## Live selector validation and excluded-resource boundary

Run `e4bbabbb-6a94-41b9-a32b-a43b286498c8` tested the corrected selector at `2026-09-10T17:45:35.549Z`–`2026-09-10T17:45:38.080Z`. Its manifest is `data/business-sources/nh-childcare/visible-result-probes/e4bbabbb-6a94-41b9-a32b-a43b286498c8/manifest.json`, SHA-256 `d5cdfa7a6dd8122904ec622aae26f5ac1b93c4918496070bb99384c96cea3e69`.

The run showed six displayed and visible cards, correct query controls, and **zero DOM projection rejections**. It still failed overall, retained no accepted source rows, and verified browser cleanup. There was one search submission and 72 routed requests, with no downloads. The old receipt does not independently establish a successful selected-object profile, because it did not separately record that stage.

The newly identified local blocks were:

- `www.google-analytics.com`: script and fetch;
- `translate.googleapis.com`: script;
- `maps.google.com`: five image requests.

All eight were rejected locally as unsupported hosts, before fetching. Five additional transport failures were observed during browser closure. These are not evidence of publisher HTTP access denials.

The visible-only network guard now continues to abort the exact host/type pairs above and records them as deliberate exclusions, not publisher failures. It does **not** add hosts to the fetch allowlist. Non-HTTPS, credential-bearing, port-bearing, over-budget and cancelled requests cannot take this exclusion path. Other unsupported hosts or resource types remain fatal. The legacy CSV probe still uses the original strict guard.

The visible probe records a close boundary after selected-result validation. Transport/fulfill failures observed after that boundary are classified separately as shutdown uncertainty; prior failures and all scope, redirect and access-policy denials remain fatal. After closing the browser it waits up to 20 seconds for tracked route handlers, including disposal, to settle before final verification. A late HTTP denial therefore cannot be missed merely because its handler was still pending. Timeout fails the run; cleanup may exceed the 90-second acquisition deadline. This is not proof that every background resource completed successfully.

The policy file records these exact exclusions and shutdown limits. New receipts separately identify successful selected-object validation, excluded resources, shutdown failures and remaining handlers. This change does not permit raw HTML, contacts, secrets, map coordinates or public export.

Seventeen focused tests passed, including exact exclusions without fetching, forbidden variants, preservation of pre-close failures, legacy behavior and a late HTTP 403 held through response disposal. No further live lookup was made after these changes. Collection readiness and native successful retention remain unverified.

Final `npm run check` passed for this revision: 1,782 tests, 1,771 passed, 11 skipped, zero failures; lint, web/desktop builds and desktop control-plane smoke passed. The log `data/tmp/nh-visible-exclusions-check.log` includes the final late-denial/settlement test. The offline NH browser fixture and all previously available PDF, Iowa reporting, retained-cohort, Overture runtime and Oklahoma inventory flags were enabled. Separate type checking passed and the production dependency audit found zero vulnerabilities. The approved Oklahoma scope hash remained unchanged; its failed batch was not retried.
