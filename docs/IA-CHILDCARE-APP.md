# Iowa standalone collection ownership

The Iowa worker joins the existing Co*Tive industry queue as `state-ia-childcare-centers`, scoped only to Iowa childcare. It composes [bounded acquisition](IA-CHILDCARE-ACQUISITION.md) and [offline normalization](IA-CHILDCARE-NORMALIZATION.md); no new server or worker dispatch branch is required.

Native mode uses the fixed published map contract. Retained mode verifies an explicit existing acquired manifest and performs only local processing. Injected transport remains test-labelled, including when its retained evidence is read by a subprocess. Acquired releases use their own global unique IDs; normalized outputs belong to the app job. Before success, verification checks child hashes, source modes, timestamps, job-specific normalized paths and all receipt files.

The app persists immutable start, acquired, normalized and terminal evidence under its output root. Output ownership and native publisher exclusion prevent overlapping runs. Acquisition also enforces its own request exclusion. Cancellation drains child work before writing terminal cancellation evidence and releasing locks. Once a child manifest is committed, its final read-only verification drains without the cancelled signal and returns its descriptor for parent checkpointing; the parent records that reference before stopping at the next cancellation boundary. A regression test cancels at publication and proves the acquired release remains referenced and reusable with source requests disabled. There is no automatic retry, crash recovery or recurring refresh enabled by this enrollment. Unknown publication state and stale locks require inspection; preserved acquired releases can be explicitly reused.

Run from the repository without Codex or ChatGPT:

```powershell
node scripts/build-ia-childcare.mjs
node scripts/build-ia-childcare.mjs --acquired "<absolute acquired manifest path inside datahub>"
node scripts/verify-ia-childcare-app.mjs --receipt "<absolute app receipt path inside datahub>"
```

The first command performs a new bounded collection; the second reuses acquired data offline. Do not rerun native collection merely to promote or reprocess an existing verified release. The CLI accepts the queue's `--output` argument and `INDUSTRY_SEGMENT_RUN_ID` environment binding, and exits successfully only after independent receipt verification.

Enrollment and tests do not prove dispatch, successful collection or measured coverage. Actual handoff requires a managed operation ID and persisted receipt. After acceptance, Co*Tive owns downloads; agents return to validation/connector work without routine download polling. The state-access ledger keeps configured execution separate from national coverage and submitted operations.

Source records remain internal center/preschool candidates, not verified current businesses or unique establishments. Source ZIP5 and ZIP4 remain separate; unknown update clocks, address role, reported state and point accuracy remain quality gaps. No national production pointer, public export permission or recurring schedule changes here.

Release checks passed: `npm run check` (1,486 tests; 1,475 passed, 11 skipped, zero failures), lint, desktop build, desktop control-plane smoke, TypeScript and production dependency audit (zero vulnerabilities). Log: `data/tmp/ia-app-full-check.log`. All 82 held national production-plan pins stayed unchanged. App tests include a separate-process retained-input CLI run, independent CLI verification, overlap exclusion, cancellation, child-reference tampering and cancellation exactly at acquisition publication followed by successful offline reuse. The live management plan selected exactly one Iowa task; planning is not dispatch.

Any accepted operation will be recorded below. Rollback removes the Iowa industry entry and isolated app modules without deleting historical receipts or acquired/normalized artifacts.
