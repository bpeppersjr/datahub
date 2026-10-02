# Proposed additive CMS directory production — October 2, 2026

Plan 76 is the current clean-repository successor after the retained Connecticut, Delaware, Florida, and Oregon business catalogs were reconciled to their exact current verified manifests.

- Run ID: `production-cms-directories-20261002-76`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261002-76.json`
- Exact confirmation SHA-256: `a478c262362cce29640635f3880a3ff108ac62c6881d46a0cd3b863c9a53e11b`
- Plan file SHA-256: `effc9f1fd84064b5f1261367b035f9f02ce5575882e36b30dc0b717046002918`
- Planning repository commit: `4ba2327728533dfbd9b12cfd16460628730ffa51`
- State-catalog reconciliation commit: `4ba2327728533dfbd9b12cfd16460628730ffa51`
- Created: `2026-10-02T10:14:06.201Z`

The retained-only plan contains the governed 25-source roster, four baseline/geographic inputs, four previously selected childcare inputs, retained childcare, Minnesota credential reporting, and the retained CMS hospital and nursing-home directory cohorts. It has eight sequential build/verify stages, zero acquisition stages, and zero network stages.

Read-only exact-plan preflight returned `READY`, revalidated all pins, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 239,365,918,720 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

Connecticut, Delaware, Florida, and Oregon catalogs now agree with their exact retained pointers and manifests. Their full offline verifiers passed, including Florida's 12,808,196-row quarterly archive. Physical-site and establishment counts remain `null`; source-specific registration/license evidence is not upgraded to proof of current operation or complete business coverage.

Verification supporting this plan includes 2,828 repository tests: 2,759 passed, 69 skipped, and zero failed. Discovery, assessment, connector, lint, web-build, desktop-build, and desktop control-plane gates passed. The production dependency audit reported zero vulnerabilities. The required stop/relaunch sequence completed, `/api/health` returned `ok`, and exactly one loopback listener remained.

This document and plan do not constitute approval. Execution requires a later explicit approval naming this exact run ID and SHA-256. Plan 75 and every earlier CMS directory plan or approval are superseded. No source acquisition, network request, production execution, production pointer change, or governed evidence rebuild occurred while preparing Plan 76.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261002-76 --expected-plan-sha256 a478c262362cce29640635f3880a3ff108ac62c6881d46a0cd3b863c9a53e11b
```
