# Connecticut retained-cohort reporting

Reporting reads the pinned, verified CT app receipt and independently replays acquired and normalized releases. It never downloads data or trusts caller-supplied counts. The [completed source cohort](CT-CHILDCARE-APP.md#verified-application-outcome--september-8-2026) is internal candidate evidence, not a national business registry release.

```powershell
node scripts/report-ct-childcare.mjs
node scripts/report-ct-childcare.mjs --receipt <absolute-app-receipt>
node scripts/report-state-access.mjs
```

The no-argument command uses `config/ct-childcare-reporting-enrollment.json`, which pins the exact native app receipt path and SHA-256. If the config is absent, status is not-enrolled; if its local receipt is absent, status is unavailable. Neither means zero businesses. Malformed paths, changed hashes, invalid receipt linkage and injected or retained-mode receipts cannot qualify for the native enrollment. An explicit receipt report can describe its true execution mode without enrolling it.

## Counts, percentages and gaps

Reports group accepted source candidates by reported state and ZIP5, including null buckets. They do not infer county assignments or geography from the publisher's Connecticut scope. Each group's percentage uses all accepted rows in that retained cohort as its denominator. National industry percentage, national completeness and unique active-business count remain unavailable, not 100%.

Repeated credentials remain separate source rows. Distinct credential counts help expose repetition, but they do not establish business identities. No capacity sum is published as a unique-facility total. Date/capacity availability, missing addresses/names/cities/states, postal gaps and unavailable coordinates remain visible. ZIP4 stays separate in underlying records and is never joined to ZIP5 for grouping.

The state-access ledger adds `localSourceCandidateEvidence` alongside—not in place of—Pennsylvania's existing `localFacilityEvidence`. The CT projection is limited to publisher jurisdiction CT and labels its quality statistics as whole-cohort statistics. Other states are outside that publisher projection's scope. Local evidence does not rewrite the ledger's published national coverage status or claim a new app dispatch/schedule.

## Provenance and reuse

The summary binds app, acquired and normalized hashes and run IDs. Its observation timestamp is acquisition completion; individual page observations remain available in normalized provenance. The source catalog update remains separate. Complete dependencies are verified again before reporting returns.

Enrollment adds visibility to retained local data without repulling, changing source releases or promoting national production. No business geometry, independent geocoding, identity matching or public export is implied. Rollback removes this reporting binding from use while preserving all source and derived releases.

## Installed cohort evidence — September 8, 2026

The installed enrollment and CLI returned available after full offline verification: 1,390 accepted candidates, no quarantine, 230 ZIP5 groups, 1,208 separate ZIP4 values, one missing street and zero coordinates. Native app receipt SHA-256 remains `387fbe174b0ea69ab67e65ce5e209b5ba94267e19d4e710cb02e5ada79ce6f46`. All accepted rows report CT, so CT's percentage of this particular cohort is 100%; national industry percentage and unique active-business count remain null.

State-access report `data/state-access/reports/20260908183236-6a39c416-c4bd-49b7-85ea-2c70c753a907.json` preserves 51 jurisdictions and 459 industry cells. Its CT childcare `localSourceCandidateEvidence` is verified-retained-cohort with 1,390 candidates, while the separate published national status remains unsupported-evidence-not-measured. National-data state evidence (202 cells) and direct-state-publisher evidence (8 cells) are unchanged; connector enrollment is not national integration. All 82 pending production pins remain unchanged.

## Verification

Six reporting/enrollment test groups passed, including full synthetic app replay, nullable grouping/conservation, exact quality counts, dependency tampering, unavailable versus zero, native enrollment with the installed receipt, and rejection of a valid injected app receipt for native enrollment. The 23 state-ledger tests also passed. No test transport was promoted into the installed cohort.

Full `npm run check` passed: 1,264 tests, 1,253 passed, 11 explicitly skipped, none failed; lint, builds and desktop smoke passed. Type checking passed and the production dependency audit reported zero vulnerabilities. Log: `data/tmp/ct-childcare-reporting-full-check.log`. No source download, national pointer change or schedule activation accompanied this reporting work.
