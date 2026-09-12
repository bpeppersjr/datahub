# Proposed additive CMS directory production

Plan created successfully on September 12, 2026; not dispatched.

- Run ID: `production-cms-directories-20260912-01`
- Plan: `data/reconciliations/production-plans/production-cms-directories-20260912-01.json`
- Confirmation SHA-256: `c601fd2ab3d6762a57f8b1dd17ee3629ea16aa836babee70a66dbd56a6cd780e`
- Verified application release: `f7f28e14b91d632053b5cd004e751fa59e8e9512`, pushed and remote verified. Clean check passed: 2,181 top-level tests, 2,113 passed, 68 skipped, zero failed; 27 acquisition child cases also passed. Lint, builds, desktop smoke, type checking and dependency audit passed. App restored, PID 27316, public health verified by root.

Root compared the new plan with the preceding MN plan: all 25 source pins, four geographic/baseline input pins, four optional MA/NJ/recovered-TN/OH pins, retained-childcare pin and MN credential pin are exactly preserved. New previous-output pins match all four outputs of the successful MN receipt, rather than the older pre-MN rollback baseline.

The additive inputs are 5,419 hospital directory rows and 14,690 nursing-home directory rows, using already retained and replayed source evidence. They remain separately typed directory records, not 20,109 new verified businesses. Nursing recovery preserves the original failed acquisition. No new source download, geocoding request, PECOS acquisition or Nebraska provider acquisition is included.

Eight stages rebuild and independently verify registry, entity resolution, benchmark and coverage. Publication is sequential across these datasets, not atomic as one cohort. Existing releases are retained; the run creates new local output versions and consumes additional disk space. It does not activate ten-source enrollment automatically; successful production evidence must be reviewed before that separate binding.

Memory profile remains `national-12g`: 12,288 MiB V8 old-space ceiling per child, with 16,384 MiB free / 24,576 MiB total preflight thresholds. This is RAM configuration, not storage allocation, a reservation or an overall RSS cap.

Execution awaits approval of this exact plan. Historical MN approval is not reused. Main executable/configuration pins stay unchanged while awaiting disposition; app and source development continue in isolated checkouts. The unresolved Census geocoding quarantine is unrelated to this retained-only rebuild and remains intact.
