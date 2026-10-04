# Proposed retained-data production reconciliation — October 3, 2026

Plan 136 is the clean-code successor after adding seven publisher-specific retained childcare evidence dimensions to the pointer-free national exact-ZIP industry matrix.

- Run ID: `production-cms-directories-20261003-136`
- Local immutable plan: `data/reconciliations/production-plans/production-cms-directories-20261003-136.json`
- Exact confirmation SHA-256: `bf22e360efaa8eebb0ffeb710a7398e0f9e3048473734ca803c4bb52233773ef`
- Plan file SHA-256: `097b7e09a7475700d6b5675b5b3a675da4dd6d36f74208a1ce8220551a82db79`
- Planning repository commit: `5e98759262843082ee1d45cca7750ccad85cbf8f`

The retained-only plan has eight sequential stages, zero acquisition stages, and zero network stages. It retains the governed source roster, baseline and geographic inputs, seven childcare publisher cohorts, Minnesota credential reporting, and CMS hospital and nursing-home cohorts.

The current pointer-free exact-ZIP matrix has 48,194 cohort rows and 867,492 source-specific cells. The childcare evidence remains separated into PA, CT, MD, VT, CO, UT, and IA publisher dimensions. It conserves 12,206 candidates: 12,205 reported ZIP5 values and one Maryland candidate explicitly classified by its retained source contract as `invalid-source-zip-range`. Maryland ZIP5 `21708` remains a separate positive out-of-cohort source gap and is not classified as invalid. No childcare identity merge, current-operation claim, national denominator enrollment, or public export is introduced.

Read-only exact-plan preflight returned `READY`, revalidated every pin, and reported `writes_performed=false`. The `national-12g` profile remains selected. Available disk was 163,011,899,392 bytes against a required rebuild floor of 13,309,329,011 bytes. No production run directory was created.

This document and plan do not constitute approval. Execution requires later explicit approval naming this exact run ID and confirmation SHA-256. Plan 135 and all earlier plans or approvals are superseded without execution. No source acquisition, network request, reconciliation execution, or production pointer change occurred while preparing Plan 136.

```powershell
npm run reconciliation:production:preflight -- --run-id production-cms-directories-20261003-136 --expected-plan-sha256 bf22e360efaa8eebb0ffeb710a7398e0f9e3048473734ca803c4bb52233773ef
```
