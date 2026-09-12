# Ten-source app consumer

The existing `/api/dataset-representation` response and eight-source UI remain unchanged and selected by default. A separate source-set choice mounts the ten-source consumer; switching back remounts the existing eight-source view. It never renames an eight-source result as ten-source evidence.

Authenticated `GET /api/dataset-representation/ten` accepts no query or body and performs no enrollment, source, plan or publication writes. Its fixed 30-second response deadline returns 503 when exceeded, including when a reader resolves after abort or never settles. Disconnects cancel the reader signal. The UI uses a 35-second deadline and cancels/ignores late results on unmount. Recheck means another read, not acquisition or production dispatch.

The reader is the separately tested file-backed ten-source contract: exact enrollment, current coverage/registry and successful production receipt bindings, conservative source-specific directory aggregates, and independently bound IRS summary. It checks persisted aggregate/receipt integrity, not raw-source rows or stage logs. An absent enrollment is HTTP 200 with pending status and no counts, not an error or fabricated zero. Invalid evidence is unavailable, never replaced with eight-source results.

When a future verified enrollment exists, state dataset-presence percentages retain a ten-dataset denominator and are explicitly not industry or all-business completeness. Hospital and nursing counts retain their distinct directory-row units, source clocks and national/stateDC cohort denominators; territory totals stay separate. Unlike units are never added. Historical nursing acquisition failure remains visible despite retained recovery. No county assignment, operating-business inference or public redistribution is implied.

## Implementation acceptance — 2026-09-12 UTC

The disclosed Astra fallback implemented this bounded consumer. Focused HTTP/UI/file-backed tests passed, including resolved-after-abort, noncooperative reader, pre-aborted request, destroyed response, authenticated read-only API, missing enrollment, default-eight selection, late-result cancellation, and typed fixture rendering. TypeScript, owned ESLint, dependency audit (zero vulnerabilities), and web/desktop builds passed.

`stop-collector.bat` was run before native acceptance. `scripts/verify-ten-reporting-ui.mjs` then passed against the actual local app: authenticated eight-source evidence was available with 51 states/DC; ten-source evidence reported `production-enrollment-absent`; no ten-source table or percentages appeared; 100%/200% screenshots passed; switching back preserved the eight-source text exactly. No enrollment, adoption, production run or download occurred. Logs and screenshots are under `data/ui-verification/ten-consumer-*` and `ten-reporting-pending-100.png` / `ten-reporting-pending-200.png`.

The combined full-check and final app restoration are recorded separately after completion; this checkpoint does not claim future production enrollment or a published expanded catalog.

## First combined check and fixture isolation

The first combined check exited 1: 2,173 tests, 2,092 passed, 14 failed and 67 skipped (`data/ui-verification/check-ten-consumer-final.log`). Lint/build phases were not reached. All failures were in the hospital/nursing acquisition test suites: both shared the same app-root synthetic provider lease while Node ran test files concurrently. The first hospital failure received “source lease unavailable” instead of reaching its expected publication-uncertainty checkpoint; nursing failures likewise reported unavailable lease / EEXIST and zero transport calls. These are retained diagnostics, not a passing release claim.

Test-only repair runs each acquisition file in a unique app-contained child APP_ROOT, with an isolated copy of the nursing policy. Intentional within-suite hospital/nursing budget exclusion, native path derivation, source-policy checks and cancellation tests remain unchanged. No production acquisition module, native lease or old receipt is rewritten. Failed child fixtures remain available for diagnosis; successful owned roots are removed after exact child-test counts are asserted. Inherited Node test context is cleared to prevent recursive test skipping.

Concurrent focused verification passed two parent wrapper tests and all 27 child tests (12 hospital, 15 nursing), with zero skipped/failed (`cms-acquisition-isolation-focused.log`). This reporting distinction explains the smaller top-level count in the next suite. Owned lint and diff checks passed. The next combined check also includes the independently reviewed Utah discovery and Census geocoder service code; native Census execution and provider-lease recovery are outside this test run.
