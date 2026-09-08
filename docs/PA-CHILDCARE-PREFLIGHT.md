# Pennsylvania childcare source readiness

This is a metadata/count preflight, not a facility collector or a claim of complete Pennsylvania business coverage.

## Source and scope

The Pennsylvania Department of Human Services publishes the [childcare and early-learning catalog](https://data.pa.gov/api/views/ajn5-kaxt.json). The candidate subset uses the exact predicate `provider_type='Child Care Center'`; home providers and other early-learning categories are excluded. Its monthly-list membership is a publisher assertion, not independent verification that each business currently operates. The catalog update timestamp is not an independently verified record observation or month-end cutoff.

The [portal policy](https://data.pa.gov/data-policy) permits free use without restriction and requests attribution. It also contains accuracy, liability, secondary-use, applicability and change provisions. The preflight checks and retains all six sections together, not merely the opening permission paragraph. A changed notice stops the check for review. Catalog license labels do not grant blanket permission to publish personal information.

## Runtime boundary

Run `node scripts/preflight-pa-childcare.mjs` from the repository. It makes six fixed serial requests: policy, catalog, center counts, center counts, catalog, policy. It requests no facility rows. It checks stable selected metadata, paired counts, distinct location-key conservation and complete policy text. Missing point or license values are measurable gaps, not silently filled values.

Requests have a one-second minimum spacing, a 30-second header/body deadline, a two-million-byte response ceiling and a 120-second total cooperative deadline. Redirects, arbitrary URLs and automatic retries are not allowed. Cancellation interrupts transport and pacing. Provider deferral ends the attempt without switching APIs.

Raw catalog metadata can contain cached contact and person samples. Only selected schema descriptions, publisher identity, update time and aggregates survive the in-memory projection. Raw-body checksums record the response identity, but do not make discarded bodies replayable or independently authenticate the source. Complete receipts are immutable, checksummed and stored under `data/business-sources/pa-childcare-centers/preflights`; no production pointer is replaced.

## Verified native preflight — September 8, 2026

The standalone CLI completed six native requests from `2026-09-08T16:06:39.866Z` to `2026-09-08T16:06:47.978Z`. A separate local validation replay passed. The publisher returned 4,995 listed centers, 4,995 distinct location keys, 4,930 non-null points and 4,995 non-null license numbers. The 65 missing points are retained as a gap. The catalog update time was `2026-08-13T14:32:18.000Z`.

Receipt: `data/business-sources/pa-childcare-centers/preflights/db05d26d-2ffe-45bb-8e68-ddd4612055a1.json`, 26,189 bytes, SHA-256 `0ee410659a4e47fb4fda75c4e4dfd9a3df049a495e461b4619923b0b835ea7ca`. This is source-readiness evidence, not a managed facility-acquisition job or national promotion. No facility records were retained.

## Next acquisition milestone

Before app handoff, implement bounded record acquisition with deterministic pagination and duplicate/drift checks; preserve selected source records and provenance; normalize facility addresses with separate ZIP5 and ZIP4 and nullable latitude/longitude; verify source and normalized conservation; then enroll the connector in standalone managed operations with cancellation, failure recovery and receipt tests. Do not store business polygons. Location identifiers are not yet proven stable across refreshes.

The policy profile here deliberately covers readiness evidence only. A separate facility acquisition profile must describe that actual field selection and retention/export behavior. This is an implementation boundary, not a claim that Pennsylvania requires an additional license or user approval.

Implementation reuse candidates: the NY retail-food connector's keyset paging, Delaware's bounded Socrata transport, Ohio childcare's app receipts, and Wisconsin childcare's immutable release/replay pattern. The older PA registry HTTP helper buffers text before applying its consumed-size limit and is not a suitable transport shortcut. Keep null source fields explicit; Socrata may omit them. Calendar dates do not imply UTC timestamps, and source capacity remains text until separately validated. Bracket collection with membership checks as well as counts: equal counts alone cannot establish a stable snapshot. Persist a completed acquisition before normalization so a downstream quality failure can be repaired without another download.

After verified enrollment, Co*Tive—not a Codex polling loop—must own acquisition and scheduled refreshes. Handoff requires an actual application operation ID and persisted receipt. Reprocessing retained verified data must not trigger another download. Until that milestone, readiness explicitly reports `connector_ready`, `acquisition_authorized`, `app_enrolled` and `scheduled` as false.

Rollback: stop using the new preflight entry point. It has no enrollment, active schedule or source-current pointer to undo; preserve already written receipts.

## Verification notes

Nine focused offline tests cover selected-field privacy, source/aggregate drift, malformed schemas/counts, receipt tampering, immutable publication, path rejection, cancellation and case-insensitive HTTP identity encoding. Policy-dependent tests use the reviewed local fixture `data/tmp/pa-data-policy-fragment.html`; if absent, those cases explicitly skip rather than fetching a replacement. The live preflight above is separate evidence and is not simulated by those tests.

Two default-parallel repository checks encountered the same existing development-supervisor startup timeout while all PA cases passed; that startup test passed in isolation. The logs are retained at `data/tmp/pa-childcare-full-check.log` and `data/tmp/pa-childcare-full-check-rerun.log`. A full-suite rerun with four concurrent test files is used to separate workload contention from a source-preflight failure; no test assertions or startup deadlines were relaxed.

The bounded full-suite run completed with 1,199 tests: 1,188 passed, 11 explicitly skipped and none failed (`data/tmp/pa-childcare-tests-bounded.log`). All nine PA tests ran and passed. Lint, TypeScript, web/desktop builds, desktop control-plane smoke and the production dependency audit also passed; the audit reported zero vulnerabilities. These are separately completed check stages, not a green default-parallel `npm run check`. The separate pending national rebuild's 82 code/configuration pins remained unchanged.
