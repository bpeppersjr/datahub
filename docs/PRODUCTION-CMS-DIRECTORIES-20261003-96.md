# Proposed additive CMS directory production — October 3, 2026

Plan 96 is the current clean-repository successor after committing three pointer-free research and status releases: the national business temporal-claim matrix, the ZIP denominator gap cohort, and the ZCTA GDP allocation-method evaluation.

- Run ID: `production-cms-directories-20261003-96`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-96.json`
- Exact confirmation SHA-256: `02349ee7dea47ec2074e244a27ab2e10f9427bcce33cf7361b15eec6501829df`
- Plan file SHA-256: `6ce9376c59546b72d501483dcf3c1a4287f9afef4007564445c0f539c42ae417`
- Planning repository commit: `8b5a270`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

The pointer-free national business temporal-claim matrix release `national-business-temporal-claim-matrix-534d123499d07ec1beace832268a741fd2228897f222354905c43c2fb09d2090`, manifest SHA-256 `342691d68f76cc38bc8ce480266fd5d36be3c7f892d258b8bfde5be94417ed05`, classifies 30 retained sources by their actual temporal claim. Eleven of 51 state/D.C. jurisdictions have a broad source class; none has verified-current complete all-business coverage. Active-business counts and completeness remain null.

The pointer-free ZIP denominator gap release `zip-denominator-gap-cohort-20261003072243230-9f1be37aa2eb`, manifest SHA-256 `792361841d937a508d0243b22cf3c7b3fe67e32d2749adadca299ad59c21f8ea`, conserves 48,194 keys: 33,791 same-code Census ZCTAs, 14,361 source-contributed ZIPs outside the ZCTA set, 41 denominator-only ZIPs outside the ZCTA set, and placeholder `00000`. It is a governed handoff cohort, not proof of a current authoritative USPS operational ZIP denominator; USPS validity and deliverability remain null.

The pointer-free ZCTA GDP allocation-method evaluation release `zcta-gdp-allocation-method-evaluation-aa4cac3bcc668d80f2245e40b50da267db3642b694eb03984451017006e0cf65`, manifest SHA-256 `ed84cd953807d447901edb15bc0c4386587c80ac565b8246a88d062219134b92`, contains 65,631 relationship-evaluation rows and 3,091 county diagnostics. It evaluates area, payroll, and establishment proxy availability against 2020 ZCTA, 2023 ZBP, and 2024 BEA vintages. It emits no numeric GDP values and does not approve a ZIP GDP model.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 215,355,133,952 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

The full repository gate ran 3,166 tests: 3,090 passed, 76 skipped, and zero failed. Lint completed with four pre-existing warnings and no errors; web and desktop builds, desktop control-plane smoke, focused native release verifiers, independent reviews, and the production dependency audit passed.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and confirmation SHA-256. Plan 95 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 96.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-96 --expected-plan-sha256 02349ee7dea47ec2074e244a27ab2e10f9427bcce33cf7361b15eec6501829df
```
