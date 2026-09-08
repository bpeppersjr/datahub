# Retained Pennsylvania childcare reporting

This read-only reporting layer connects the verified PA app collection to Co*Tive's state-access reporting without acquiring source data or changing published national totals. It operates on retained app, acquired and normalized manifests. It does not add a dashboard tab or claim national registry integration.

## Commands

From the datahub directory:

```powershell
node scripts/report-pa-childcare.mjs
node scripts/report-pa-childcare.mjs --receipt "<absolute app receipt>"
node scripts/report-state-access.mjs
```

The first command verifies the fixed enrollment in `config/pa-childcare-reporting-enrollment.json`. It returns an `available` envelope and full cohort summary when the pinned native-mode release is installed. Missing enrollment and missing retained files are distinct states, never fabricated zero counts; the command exits 2 for unavailable enrollment/data. Verification errors exit 1 with redacted diagnostics.

Explicit receipt mode returns a verified summary, including truthful execution mode, for either native, injected-test or retained-reprocessing receipts. It cannot enroll injected evidence into the production state-access view. Neither mode makes provider requests, starts a collection or accepts a caller-supplied national denominator.

State-access reports gain `localFacilityEvidence` under the childcare industry. PA contains its verified local counts, quality, exact receipt/manifest pins, managed industry operation ID and observation/update timestamps. Other jurisdictions return `outside-publisher-scope`, not a claim that they contain zero facilities. The existing `accessEvidenceStatus` still describes the separately published national coverage artifact; `appHandoff.jobSubmitted` describes actions by the ledger itself, not historical app activity. Local retained evidence does not manufacture national reporting or a new dispatch.

## Measures and provenance

The `pa-childcare-reporting@1.0.0` summary has state, reported county/name-FIPS pair and reported ZIP5 buckets. Each partition conserves all accepted facility rows; missing labels and ZIP5 remain explicit null buckets. Quarantined rows are separately counted and do not enter accepted-row percentage denominators. All-zero accepted cohorts have no invented percentage.

Every percentage is `bucket accepted rows / all accepted rows in this retained PA center cohort * 100`. This is not the percentage of U.S. businesses, state childcare completeness, unique entities, market share or independent license validity. National completeness and unique-active-business counts remain null. No independently verified national denominator exists for this source scope.

Quality counts include available ZIP5, separate ZIP4, coordinates, missing coordinates and unavailable numeric capacity. No ZIP5/ZIP4 concatenation, geocoding inference, entity polygon or government-boundary assignment is introduced. Source county labels and FIPS are reported values, not validated county assignments. The aggregate output omits facility names, street addresses and individual identifiers; their provenance remains in internal normalized records.

The summary binds app receipt, acquired manifest and normalized manifest SHA-256 values. It independently replays release membership, rejects duplicate source identities and rehashed record substitutions, checks accepted/quarantine conservation and rereads dependencies before return. Source update time is distinct from `observed_at`, which here means acquisition completion; individual page observations remain available in normalized record provenance. Offline consistency is not independent remote-source authentication.

## Retained enrollment and rollback

The initial enrollment pins app job `a6997ff5-9dd9-40de-a1aa-600a23da5ff2`, managed operation `b56d91bb-b781-4fe6-b7f9-be50bd4234ee`, from the [verified app handoff](PA-CHILDCARE-APP.md#live-application-outcome--september-8-2026). It contains 4,995 accepted rows, 819 reported ZIPs, 66 reported county label/FIPS pairs and 65 missing coordinates. All rows have ZIP5, none supplies ZIP4; 730 source capacity values remain the text `School Age Provider`.

No current pointer, source release, national production plan, schedule or export permission is changed. Future reporting refreshes must explicitly bind a verified retained release; editing an enrollment path alone does not validate new data. Rollback removes this reporting enrollment/integration while preserving all acquired data, app receipts and normalized releases. Do not repull data merely to change this projection.

## Verification evidence — September 8, 2026

The standalone enrolled report independently replayed the retained native source and returned the expected 4,995 rows, 819 ZIP buckets, 66 county buckets and documented gaps. State-access report `data/state-access/reports/20260908171909-789ff1de-124c-4d35-ab36-e17ef0922d21.json` contains the same verified PA local evidence alongside the unchanged published national evidence status. It covers 51 jurisdictions and 459 configured industry cells; neither the cell count nor PA's 100% share of its own single-state cohort establishes U.S. industry completeness.

Synthetic end-to-end tests exercise a 501-source-row app release: 500 accepted, one quarantined, six accepted records with unavailable ZIP5, and separate ZIP4 values. Bucket conservation, nullable county labels, duplicate source identities, rehashed state/ZIP substitutions, exact CLI output, early cancellation, missing enrollment/data, path/pin rejection and refusal to enroll injected-source evidence are checked without provider requests. All 24 focused enrollment/ledger tests and both grouped reporting tests passed. TypeScript and production dependency audit passed with zero reported vulnerabilities. The existing 82 pending national production code/configuration pins remained unchanged.

Full `npm run check` passed: 1,229 tests, 1,218 passed, 11 explicit skips, zero failures; lint, web/desktop builds and desktop control-plane smoke also passed. Log: `data/tmp/pa-childcare-reporting-full-check.log`.
