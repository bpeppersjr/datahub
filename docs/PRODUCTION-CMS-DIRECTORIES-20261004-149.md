# Proposed retained-data production reconciliation — October 4, 2026

Plan 149 is the planning-only successor to Plan 148 after acceptance hardening commit `a74a7d3`. Its repository context also includes the demographic GDP workspace commit `eaf6e94` and USPS projection guardrails commit `addf775`. It carries forward Plan 148's exact four retained selections; it does not approve or start production work.

- Run ID: `production-cms-directories-20261004-149`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261004-149.json`
- Plan confirmation SHA-256: `4113bd1dcd8a399b40f27c319a8c041cb1ef94c6351b57f3f18acf39007d9382`
- Plan file SHA-256: `55c3851c93cf158563584bb4628a1c539ae787531001aa39a834e07ace85f57f`
- Planning repository commit: `a74a7d3`
- Plan 148 predecessor confirmation SHA-256: `1ad9f7699391d2638fe29073170b3d8979195e10954f598c30da237523d8d303`

The four selection pins exactly match Plan 148: `config/retained-childcare-registry-selection.json` (SHA-256 `622a8bdf41b5456e41a33ebf45c4daac936c152b004159ca35271073ac3d82b6`), `config/mn-credential-registry-selection.json` (`bda3ff50d5ec3ad4d66fa2c3dae0594fe96274f8698c4406d94e7ba002368154`), `config/cms-hospital-retained-selection.json` (`1ac6c2ca44b160365e245d6d0b5a39b9ec33461f4f7d4f35daf3e8550700b563`), and `config/cms-nursing-home-retained-selection.json` (`f23b33d56227317cb5bf53c96ad51901e35ea8c954e98e16d53fe934e3551630`). Childcare reporting rows and Minnesota credentials remain distinct from unique businesses, physical sites, and verified current operations.

Exact-plan preflight returned `READY`, revalidated all pins, reported eight stages, zero source-acquisition stages, zero network stages, and `writes_performed=false`. Both retained CMS inputs were confirmed. The `national-12g` profile was retained; available disk was 161,406,283,776 bytes against a required floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan are proposed, unapproved, and unexecuted. Execution would require later explicit approval naming this exact run ID and confirmation SHA-256. Plan 148 and earlier plans or approvals are superseded without execution. Preparing and preflighting Plan 149 performed no source acquisition, network request, reconciliation stage, production pointer change, or production enrollment. The generated plan remains a local retained artifact and is not included in Git.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261004-149 --expected-plan-sha256 4113bd1dcd8a399b40f27c319a8c041cb1ef94c6351b57f3f18acf39007d9382
```
