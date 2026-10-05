# Proposed retained-data production reconciliation — October 5, 2026

Plan 161 is a planning-only successor to Plan 160 after the separate reporting-only site qualification and national ZIP-goal readiness binding in commit `a47aa684c16e3fc2b395d7b63fd52dd90b4abbb`. It carries forward exactly the same four retained selections and does not change their scope. This document does not approve or execute production reconciliation.

- Run ID: `production-cms-directories-20261005-161`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261005-161.json`
- Plan confirmation SHA-256: `a56702b8ee33feba6bb4bfa224234a8d5ad7fa2902fa2f9afbdcea3d4703a15e`
- Plan file SHA-256: `2585154c6d959869c7813d2c42fceffbefbffa353b72ffbdc22a1d8c84385ec5`
- Plan 160 predecessor confirmation SHA-256: `a8240c901fc6aac49bcab785d743228a9ba9782352f8965dc326a03c626d84b9`
- Plan 160 predecessor file SHA-256: `a7077b0387dd959035ec078e48f9eead3d2febB3130d6eb86c119a52cbf90597`
- Implementation commit: `a47aa684c16e3fc2b395d7b63fd52dd90b4abbb7`

The exact four selection pins are unchanged: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). Each source remains separate, source-bounded, and nonadditive. The new 13,182-row reporting-only childcare qualification is a separate local evidence denominator, not identity-matched and not included in the selected reconciliation source set; it establishes neither current operation nor production authority.

Read-only exact-plan preflight returned `READY`, revalidated all four pins, reported eight registry/resolution/benchmark/coverage build-and-verify stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were present. The `national-12g` profile was selected; available disk was 148,269,334,528 bytes against the 13,309,329,011-byte requirement. The plan is unapproved and unexecuted. Its immutable plan artifact remains a local retained artifact and is not part of the Git payload. No source acquisition, network request, reconciliation stage, production pointer change, or production enrollment occurred.

Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 160 and earlier plans or approvals are superseded without execution.

Reproduce the planning-only preflight with:

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261005-161 --expected-plan-sha256 a56702b8ee33feba6bb4bfa224234a8d5ad7fa2902fa2f9afbdcea3d4703a15e
```
