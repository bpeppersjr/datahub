# Retained Minnesota credentials in the state-access report

The state-access reporting command now includes a separate `localCredentialEvidence` section on construction cells. It reads an explicitly enrolled, checksum-pinned completed residential acquisition and independently verifies the underlying app/parent/selected-data chain. No source requests, scheduler changes, matching profiles, physical sites or national production writes are involved.

Enrollment is recorded in `config/mn-construction-reporting-enrollment.json`. The accepted source must be the residential cohort, with a `SUCCEEDED` app receipt using its fixed native-fetch entry point and the configured exact receipt SHA-256. A missing enrollment is `not-enrolled`; an absent installed receipt is `unavailable`. Invalid configured evidence fails verification rather than becoming a zero count. This validates retained evidence and execution metadata, not independent publisher authentication.

Run `node scripts/report-state-access.mjs` to produce a new immutable local report. This is CLI/JSON report visibility, **not a new dashboard/API display**. Existing national `accessEvidenceStatus`, status totals and `appHandoff` semantics remain unchanged; the added section describes a separate local evidence layer, not a national promotion or dispatch by the ledger.

## Actual report evidence

Report generated September 8, 2026:

`data/state-access/reports/20260908132500-3e408861-b16f-404e-a887-b0d9fbc1e2e9.json`

SHA-256: `6371826b9884c7496a708172079ca5799ff7e55cdc67931d45b914cfcf83de35`.

Record observation is preserved exactly as `2026-09-08T13:11:41.678Z` from the verified selection receipt, rather than the later transfer start. The standalone summary exposes transfer start separately. An earlier report (`20260908132159-8bf2a737-ee32-406f-b0c2-57b4c7cb5a85.json`, SHA-256 `e5c22571be9297a2473ea92fff9c626af1c80e9581b9d7b735b2be9a7e1a1d82`) used transfer start for this label; it remains preserved as historical output and is superseded for that timestamp by this report. Counts are unchanged.

The report contains all 50 states and D.C. Its local residential credential counts sum to **11,456** across 34 positive reported-address states, including MN 10,899 and WI 234. The publisher jurisdiction is MN in every cell. Percentage denominators are the 11,456 accepted rows in this cohort only; they are never national business counts, construction market share or evidence of direct access to 34 publishers.

An absent state within this fully verified cohort has zero cohort rows. That does not mean zero businesses or complete state coverage. Missing/unavailable enrollment has no count at all. Report-level row conservation was checked against the independently verified acquisition. Future source cohorts with addresses outside the ledger's 50-states-and-D.C. scope must retain their cohort denominator rather than silently rebasing it to displayed rows.

The report still references the existing published national coverage release `national-business-coverage-views-20260908-050200409Z-eff2f522`. National status totals remain 202 national-dataset cells, 196 unsupported/missing cells, 54 unmeasured cells and 7 direct-state-publisher cells. Local credentials do not increment those counts.

Active-business count and physical-site count remain null; current USPS assignment is unverified; the failed registrations cohort is explicitly not included. All 82 pending production code/configuration pins remain unchanged. No successful residential acquisition was repulled.

## Next integration and rollback

Validation: final `npm run check` passed with 1,076 tests passed, 11 skipped and zero failures, plus lint, web/desktop builds and desktop smoke. The dependency audit found zero vulnerabilities. Tests cover missing enrollment versus unavailable data, rejected path/pin/configuration changes, cross-state cohort percentages, unchanged fixture national evidence, and distinct record-observation/transfer timestamps.

National registry/coverage integration still needs an explicit credential-only projection and a newly reviewed production plan; do not reuse a childcare physical-site projection. Dashboard visibility is separate implementation work. The local report makes verified acquired evidence visible without claiming those unimplemented steps.

To disable this local enrollment, remove its configuration only after preserving its Git history; retained receipts and reports are not deleted. Never change a receipt hash to match unverified files or point enrollment at a failed/injected cohort simply to obtain counts.
